import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "app.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/fin-api": "http://127.0.0.1:3000",
      "/vaqf-api": "http://127.0.0.1:3000",
    },
  },
});
