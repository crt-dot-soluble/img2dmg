# img2dmg

img2dmg is a small, offline-ready web app that converts images into the classic 4-shade DMG-style palette. It supports single images or ZIP batches, runs entirely in the browser, and can be installed as a PWA.

## Links

- Repo: https://github.com/crt-dot-soluble/img2dmg
- Live site (GitHub Pages): https://crt-dot-soluble.github.io/img2dmg/
- Wiki: https://github.com/crt-dot-soluble/img2dmg/wiki

## Features

- Drag-and-drop image conversion (PNG, JPG, WEBP)
- ZIP import for batches of a single image extension
- DMG green palette and grayscale palette toggle
- Download individually or as ZIP (selected or all)
- Works offline after install (PWA)

## Quick start

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

This project is set up to deploy to the gh-pages branch.

```bash
npm run deploy
```

## Wiki source

Wiki content lives in /docs. Use the script below to publish to GitHub Wiki:

```bash
npm run wiki:push
```

## Notes

- All processing is client-side. No server is required.
- ZIP uploads must contain a single image extension type.

## License

MIT
