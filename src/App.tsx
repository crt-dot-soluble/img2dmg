import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

const DMG_PALETTE = [
    { r: 15, g: 56, b: 15 },
    { r: 48, g: 98, b: 48 },
    { r: 139, g: 172, b: 15 },
    { r: 155, g: 188, b: 15 }
];

const GRAY_PALETTE = [
    { r: 15, g: 15, b: 15 },
    { r: 86, g: 86, b: 86 },
    { r: 170, g: 170, b: 170 },
    { r: 240, g: 240, b: 240 }
];

const SUPPORTED_EXTS = ["png", "jpg", "jpeg", "webp"] as const;

type Status = "queued" | "processing" | "done" | "error";

type Item = {
    id: string;
    name: string;
    ext: string;
    file: File;
    status: Status;
    blobUrl?: string;
    width?: number;
    height?: number;
    error?: string;
    selected: boolean;
};

type DeferredPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const fileId = () => crypto.randomUUID();

const extFromName = (name: string) =>
    name.toLowerCase().split(".").pop() ?? "";

const baseName = (name: string) => {
    const parts = name.split(".");
    parts.pop();
    return parts.join(".") || name;
};

type PaletteMode = "dmg" | "gray";

const isSupportedExt = (ext: string) =>
    SUPPORTED_EXTS.includes(ext as (typeof SUPPORTED_EXTS)[number]);

const mimeForExt = (ext: string) => {
    switch (ext) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "webp":
            return "image/webp";
        default:
            return "image/png";
    }
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const downloadUrl = (url: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};

const convertToDmg = async (file: File, palette: typeof DMG_PALETTE) => {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
        throw new Error("Canvas not supported");
    }

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha === 0) {
            continue;
        }
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const level = Math.min(3, Math.max(0, Math.floor(lum / 64)));
        const shade = palette[level];
        data[i] = shade.r;
        data[i + 1] = shade.g;
        data[i + 2] = shade.b;
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
            if (result) {
                resolve(result);
            } else {
                reject(new Error("Failed to encode image"));
            }
        }, "image/png");
    });

    return {
        blob,
        width: canvas.width,
        height: canvas.height
    };
};

const App = () => {
    const [items, setItems] = useState<Item[]>([]);
    const [paletteMode, setPaletteMode] = useState<PaletteMode>("dmg");
    const [busy, setBusy] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [hoveredPreview, setHoveredPreview] = useState<{ url: string; name: string } | null>(null);
    const [installPrompt, setInstallPrompt] = useState<DeferredPromptEvent | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const activePalette = paletteMode === "dmg" ? DMG_PALETTE : GRAY_PALETTE;
    const paletteSwatches = useMemo(
        () => activePalette.map((c) => `rgb(${c.r}, ${c.g}, ${c.b})`),
        [activePalette]
    );

    const queuedCount = items.filter((item) => item.status === "queued").length;
    const doneItems = items.filter((item) => item.status === "done");
    const selectedItems = doneItems.filter((item) => item.selected);

    const hasItems = items.length > 0;
    const hasDoneItems = doneItems.length > 0;

    const setToast = (text: string) => {
        setMessage(text);
        window.setTimeout(() => setMessage(null), 3600);
    };

    useEffect(() => {
        document.body.setAttribute("data-theme", paletteMode);
    }, [paletteMode]);

    useEffect(() => {
        const handleBeforeInstall = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as DeferredPromptEvent);
        };

        const handleInstalled = () => {
            setInstallPrompt(null);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstall);
        window.addEventListener("appinstalled", handleInstalled);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
            window.removeEventListener("appinstalled", handleInstalled);
        };
    }, []);

    const handleInstall = async () => {
        if (!installPrompt) {
            return;
        }
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
    };

    useEffect(() => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.blobUrl) {
                    URL.revokeObjectURL(item.blobUrl);
                }
                return {
                    ...item,
                    status: "queued",
                    blobUrl: undefined,
                    width: undefined,
                    height: undefined,
                    error: undefined
                };
            })
        );
    }, [paletteMode]);

    const enqueueFiles = useCallback((files: File[]) => {
        const nextItems = files.map((file) => {
            const ext = extFromName(file.name);
            return {
                id: fileId(),
                name: file.name,
                ext,
                file,
                status: "queued" as const,
                selected: false
            };
        });

        setItems((prev) => [...prev, ...nextItems]);
    }, []);

    const handleZip = useCallback(
        async (zipFile: File) => {
            const zip = await JSZip.loadAsync(zipFile);
            const entries = Object.values(zip.files).filter((entry) => !entry.dir);

            if (entries.length === 0) {
                setToast("Zip is empty.");
                return;
            }

            const firstExt = extFromName(entries[0].name);
            if (!isSupportedExt(firstExt)) {
                setToast("Zip contains unsupported image types.");
                return;
            }

            const mixed = entries.some((entry) => extFromName(entry.name) !== firstExt);
            if (mixed) {
                setToast("Zip must contain only one image extension type.");
                return;
            }

            const extracted: File[] = [];
            for (const entry of entries) {
                const data = await entry.async("arraybuffer");
                const blob = new Blob([data], { type: mimeForExt(firstExt) });
                extracted.push(new File([blob], entry.name, { type: blob.type }));
            }

            enqueueFiles(extracted);
        },
        [enqueueFiles]
    );

    const handleFiles = useCallback(
        async (files: FileList | File[]) => {
            const list = Array.from(files);
            const zips = list.filter((file) => extFromName(file.name) === "zip");
            const images = list.filter((file) => isSupportedExt(extFromName(file.name)));

            if (zips.length === 0 && images.length === 0) {
                setToast("Drop images or a zip of images to convert.");
                return;
            }

            for (const zip of zips) {
                await handleZip(zip);
            }

            if (images.length) {
                enqueueFiles(images);
            }
        },
        [enqueueFiles, handleZip]
    );

    const handleDrop = useCallback(
        async (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDragActive(false);
            if (event.dataTransfer.files.length) {
                await handleFiles(event.dataTransfer.files);
            }
        },
        [handleFiles]
    );

    const startFilePicker = () => {
        fileInputRef.current?.click();
    };

    useEffect(() => {
        if (busy) {
            return;
        }
        const next = items.find((item) => item.status === "queued");
        if (!next) {
            return;
        }

        setBusy(true);
        setItems((prev) =>
            prev.map((item) =>
                item.id === next.id ? { ...item, status: "processing" } : item
            )
        );

        convertToDmg(next.file, activePalette)
            .then(({ blob, width, height }) => {
                const blobUrl = URL.createObjectURL(blob);
                setItems((prev) =>
                    prev.map((item) => {
                        if (item.id !== next.id) {
                            return item;
                        }
                        if (item.blobUrl) {
                            URL.revokeObjectURL(item.blobUrl);
                        }
                        return {
                            ...item,
                            status: "done",
                            blobUrl,
                            width,
                            height
                        };
                    })
                );
            })
            .catch((error) => {
                setItems((prev) =>
                    prev.map((item) =>
                        item.id === next.id
                            ? { ...item, status: "error", error: error.message }
                            : item
                    )
                );
            })
            .finally(() => setBusy(false));
    }, [busy, items]);

    const toggleSelected = (id: string) => {
        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
        );
    };

    const selectAll = () => {
        setItems((prev) =>
            prev.map((item) => (item.status === "done" ? { ...item, selected: true } : item))
        );
    };

    const clearSelection = () => {
        setItems((prev) => prev.map((item) => ({ ...item, selected: false })));
    };

    const clearAll = () => {
        items.forEach((item) => {
            if (item.blobUrl) {
                URL.revokeObjectURL(item.blobUrl);
            }
        });
        setItems([]);
    };

    const downloadSelectedZip = async () => {
        if (!selectedItems.length) {
            return;
        }
        const zip = new JSZip();
        for (const item of selectedItems) {
            if (!item.blobUrl) {
                continue;
            }
            const response = await fetch(item.blobUrl);
            const blob = await response.blob();
            const suffix = paletteMode === "gray" ? "-gs" : "-dmg";
            zip.file(`${baseName(item.name)}${suffix}.png`, blob);
        }
        const zipped = await zip.generateAsync({ type: "blob" });
        const zipName = paletteMode === "gray" ? "img2dmg-selected-gs.zip" : "img2dmg-selected.zip";
        downloadBlob(zipped, zipName);
    };

    const downloadAllZip = async () => {
        if (!doneItems.length) {
            return;
        }
        const zip = new JSZip();
        for (const item of doneItems) {
            if (!item.blobUrl) {
                continue;
            }
            const response = await fetch(item.blobUrl);
            const blob = await response.blob();
            const suffix = paletteMode === "gray" ? "-gs" : "-dmg";
            zip.file(`${baseName(item.name)}${suffix}.png`, blob);
        }
        const zipped = await zip.generateAsync({ type: "blob" });
        const zipName = paletteMode === "gray" ? "img2dmg-all-gs.zip" : "img2dmg-all.zip";
        downloadBlob(zipped, zipName);
    };

    const queuedLabel = queuedCount ? `${queuedCount} in queue` : "";

    const stats = useMemo(
        () => ({
            total: items.length,
            done: doneItems.length,
            selected: selectedItems.length
        }),
        [items.length, doneItems.length, selectedItems.length]
    );

    return (
        <div className="app">
            <header className="header">
                <div>
                    <p className="brand">img2dmg</p>
                    <h1>DMG Palette Converter</h1>
                    <p className="subtitle">
                        Upload images to recreate them in a familiar retro palette.
                    </p>
                </div>
                <div className="palette">
                    {installPrompt ? (
                        <button
                            className="btn ghost tiny install-btn"
                            type="button"
                            aria-label="Install app"
                            title="Install app"
                            onClick={handleInstall}
                        >
                            <span className="install-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" role="presentation">
                                    <path
                                        d="M12 4v9m0 0-3-3m3 3 3-3M5 18h14"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </span>
                        </button>
                    ) : null}
                    <button
                        className="btn ghost tiny"
                        type="button"
                        aria-label="Toggle palette"
                        title={paletteMode === "dmg" ? "Switch to gray palette" : "Switch to DMG palette"}
                        onClick={() =>
                            setPaletteMode((prev) => (prev === "dmg" ? "gray" : "dmg"))
                        }
                    >
                        <span className="palette-toggle-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" role="presentation">
                                <path
                                    d="M7 6h9m0 0-2.5-2.5M16 6l-2.5 2.5M17 18H8m0 0 2.5-2.5M8 18l2.5 2.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                    </button>
                    {paletteSwatches.map((color) => (
                        <span key={color} className="swatch" style={{ background: color }} />
                    ))}
                </div>
            </header>

            <section
                className={`dropzone ${dragActive ? "active" : ""}`}
                onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                }}
                onDrop={handleDrop}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/jpg,image/webp,.zip"
                    onChange={(event) => {
                        if (event.target.files) {
                            handleFiles(event.target.files);
                            event.target.value = "";
                        }
                    }}
                    hidden
                />
                <div>
                    <p className="drop-title">Drop files here</p>
                    <p className="drop-sub">
                        PNG, JPG, WEBP, or ZIP (single image extension type)
                    </p>
                </div>
                <div className="drop-actions">
                    <button className="btn" type="button" onClick={startFilePicker}>
                        Pick files
                    </button>
                    <button className="btn ghost" type="button" onClick={clearAll}>
                        Clear list
                    </button>
                </div>
                {queuedLabel ? <span className="queue">{queuedLabel}</span> : null}
            </section>

            {message ? <div className="toast">{message}</div> : null}

            <section className="controls">
                <div className="stats">
                    <span>Total: {stats.total}</span>
                    <span>Done: {stats.done}</span>
                    <span>Selected: {stats.selected}</span>
                </div>
                <div className="control-actions">
                    <button className="btn ghost" type="button" onClick={selectAll}>
                        Select all
                    </button>
                    <button className="btn ghost" type="button" onClick={clearSelection}>
                        Clear selection
                    </button>
                    <button
                        className="btn"
                        type="button"
                        onClick={downloadSelectedZip}
                        disabled={!selectedItems.length}
                    >
                        Download selected ZIP
                    </button>
                    <button
                        className="btn"
                        type="button"
                        onClick={downloadAllZip}
                        disabled={!hasDoneItems}
                    >
                        Download all ZIP
                    </button>
                </div>
                <div className="selection-strip">
                    {selectedItems.length ? (
                        selectedItems.map((item) =>
                            item.blobUrl ? (
                                <img
                                    key={item.id}
                                    className="selection-thumb"
                                    src={item.blobUrl}
                                    alt={`${item.name} selected`}
                                    onMouseEnter={() =>
                                        setHoveredPreview({ url: item.blobUrl!, name: item.name })
                                    }
                                    onMouseLeave={() => setHoveredPreview(null)}
                                />
                            ) : null
                        )
                    ) : (
                        <span className="selection-empty">No selected previews yet.</span>
                    )}
                </div>
            </section>

            <section className="grid">
                {!hasItems ? (
                    <div className="empty">
                        <div className="empty-screen">
                            <p>Drop images to light up the DMG screen.</p>
                            <p>All processing stays on this device.</p>
                        </div>
                    </div>
                ) : null}

                {items.map((item) => (
                    <article key={item.id} className="card">
                        <div className="card-top">
                            <label
                                className={`dmg-check ${item.status !== "done" ? "disabled" : ""}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={item.selected}
                                    onChange={() => toggleSelected(item.id)}
                                    disabled={item.status !== "done"}
                                    aria-label={`Select ${item.name}`}
                                />
                                <span className="dmg-check-mark" aria-hidden="true" />
                            </label>
                            <span className={`status ${item.status}`}>{item.status}</span>
                        </div>
                        <div className="preview">
                            {item.status === "done" && item.blobUrl ? (
                                <img
                                    src={item.blobUrl}
                                    alt={`${item.name} converted`}
                                    onMouseEnter={() =>
                                        setHoveredPreview({ url: item.blobUrl!, name: item.name })
                                    }
                                    onMouseLeave={() => setHoveredPreview(null)}
                                />
                            ) : (
                                <div className="preview-placeholder">
                                    {item.status === "error" ? item.error : "Converting..."}
                                </div>
                            )}
                        </div>
                        <div className="card-meta">
                            <div>
                                <p className="name">{baseName(item.name)}</p>
                                {item.width && item.height ? (
                                    <p className="size">
                                        {item.width} x {item.height}
                                    </p>
                                ) : null}
                            </div>
                            {item.status === "done" && item.blobUrl ? (
                                <button
                                    className="btn tiny"
                                    type="button"
                                    onClick={() => {
                                        const suffix = paletteMode === "gray" ? "-gs" : "-dmg";
                                        downloadUrl(item.blobUrl!, `${baseName(item.name)}${suffix}.png`);
                                    }}
                                >
                                    Download
                                </button>
                            ) : null}
                        </div>
                    </article>
                ))}
            </section>

            {hoveredPreview ? (
                <div className="zoom-overlay" aria-hidden="true">
                    <div className="zoom-frame">
                        <img src={hoveredPreview.url} alt={hoveredPreview.name} />
                    </div>
                </div>
            ) : null}

            <footer className="footer">
                <p>Offline-ready. No uploads. Just a DMG palette and your pixels.</p>
            </footer>
        </div>
    );
};

export default App;
