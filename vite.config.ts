import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    base: "/img2dmg/",
    plugins: [react()]
});
