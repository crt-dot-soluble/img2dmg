import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        const baseUrl = import.meta.env.BASE_URL;
        navigator.serviceWorker.register(`${baseUrl}sw.js`).catch(() => undefined);
    });
}
