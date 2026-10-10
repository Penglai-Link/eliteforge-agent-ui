import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    root: packageRoot,
    plugins: [
      vue(),
      tailwindcss(),
      dts({
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        entryRoot: fileURLToPath(new URL("./src", import.meta.url)),
        include: ["src/**/*.ts", "src/**/*.vue"],
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
          "@eliteforge/agent-ui-motion-vue",
          "@eliteforge/agent-ui-a2ui-core",
          "@eliteforge/agent-ui-a2ui-vue","@eliteforge/agent-ui-chat-core", "lucide-vue-next", "markdown-it", "vue"],
      },
    },
    server: { host: "0.0.0.0" },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
});
