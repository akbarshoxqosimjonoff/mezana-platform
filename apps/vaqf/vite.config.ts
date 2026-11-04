import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/vaqf/",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "app.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/fin-api": "http://127.0.0.1:3000",
      "/vaqf-api": "http://127.0.0.1:3000",
    },
  },
});
