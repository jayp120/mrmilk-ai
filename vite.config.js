import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom", "echarts", "echarts-for-react", "papaparse", "xlsx", "@tanstack/react-table", "@duckdb/duckdb-wasm", "json-rules-engine", "date-fns", "uuid"]
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
          analytics_vendor: ["@duckdb/duckdb-wasm", "json-rules-engine", "uuid"]
        }
      }
    }
  }
});
