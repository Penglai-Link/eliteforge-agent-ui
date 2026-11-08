import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [
    vue(),
    dts({
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      entryRoot: fileURLToPath(new URL("./src", import.meta.url)),
      include: ["src/**/*.ts", "src/**/*.vue"],
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
        "@personai/agent-ui-composer-core",
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
