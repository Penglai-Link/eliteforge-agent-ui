import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    root: packageRoot,
    plugins: [
      react(),
      tailwindcss(),
      dts({
        entryRoot: fileURLToPath(new URL("./src", import.meta.url)),
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/testLocalStorage.ts"],
        include: ["src/**/*.ts", "src/**/*.tsx"],
        tsconfigPath: fileURLToPath(new URL("./tsconfig.build.json", import.meta.url)),
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
          "@eliteforge/agent-ui-chat-core",
          "lucide-react",
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react-markdown",
          "remark-gfm",
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
