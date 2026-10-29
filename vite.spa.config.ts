import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";

const src = path.resolve("src");

/** Client-only bundle for Cloudflare Pages. No SSR. */
export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    alias: [{ find: "@", replacement: src }],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve("src/spa-entry.tsx"),
      output: {
        entryFileNames: "assets/spa.js",
        chunkFileNames: "assets/spa-[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
