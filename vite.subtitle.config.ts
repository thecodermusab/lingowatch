import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "extension",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "extension/src/subtitle/index.tsx"),
      name: "LWSubtitle",
      formats: ["iife"],
      fileName: () => "subtitle.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: true,
  },
});
