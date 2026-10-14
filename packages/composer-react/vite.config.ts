import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [
    react(),
    dts({
      entryRoot: fileURLToPath(new URL("./src", import.meta.url)),
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/testLocalStorage.ts",
      ],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      tsconfigPath: fileURLToPath(
        new URL("./tsconfig.build.json", import.meta.url)
      ),
    }),
  ],
  build: {
    lib: {
      cssFileName: "styles",
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "@eliteforge/agent-ui-composer-core",
        "react",
        "react-dom",
        "react/jsx-runtime",
        "vue",
        "lucide-react",
        "lucide-vue-next",
      ],
    },
  },
  server: { host: "0.0.0.0" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
