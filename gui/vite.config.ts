import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const DUMMY = "http://127.0.0.1:5292";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5296,
    strictPort: true,
    proxy: {
      "/api": { target: DUMMY, changeOrigin: true },
      "/ws": { target: DUMMY, ws: true, changeOrigin: true },
    },
  },
  build: { target: "es2022", sourcemap: true },
});
