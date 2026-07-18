import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    force: true,
    include: [
      "react",
      "react-dom",
      "framer-motion",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "echarts",
      "echarts-for-react",
      "papaparse",
      "xlsx",
      "@tanstack/react-table",
      "@duckdb/duckdb-wasm",
      "json-rules-engine",
      "date-fns",
      "uuid"
    ]
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react_vendor: ["react", "react-dom"],
          charts_vendor: ["echarts", "echarts-for-react"],
          data_vendor: ["papaparse", "xlsx", "@tanstack/react-table", "date-fns"],
          analytics_vendor: ["@duckdb/duckdb-wasm", "json-rules-engine", "uuid"],
          // Only the Delivery Map tab uses this — kept out of the main chunk
          // so every other tab isn't paying ~250kB for a WebGL heat layer.
          geo_vendor: ["@deck.gl/core", "@deck.gl/layers", "@deck.gl/google-maps", "@deck.gl/aggregation-layers"]
        }
      }
    }
  }
});
