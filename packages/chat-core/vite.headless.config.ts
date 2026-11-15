import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * Second, additive build for the platform-neutral `./headless` entry.
 *
 * It keeps `emptyOutDir` disabled so `dist/index.js`, `dist/mermaid.css` and
 * the declaration files produced by the main build stay untouched. Only
 * `dist/headless.js` is written; no CSS or DOM module is reachable from the
 * headless entry, so hosts like React Native never pull in `mermaid`.
 */
export default defineConfig({
  root: packageRoot,
  build: {
    emptyOutDir: false,
    rollupOptions: {
      external: [
        "@personai/agent-ui-a2ui-core",
        "@personai/agent-ui-composer-core",
        "mermaid",
      ],
    },
    lib: {
      entry: fileURLToPath(new URL("./src/headless.ts", import.meta.url)),
      fileName: "headless",
      formats: ["es"],
    },
  },
});