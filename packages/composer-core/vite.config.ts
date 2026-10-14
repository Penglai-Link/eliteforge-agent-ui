import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [
    dts({
      entryRoot: fileURLToPath(new URL("./src", import.meta.url)),
      exclude: ["src/**/*.test.ts"],
      include: ["src/**/*.ts"],
      tsconfigPath: fileURLToPath(
        new URL("./tsconfig.build.json", import.meta.url)
      ),
    }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      fileName: "index",
      cssFileName: "styles",
      formats: ["es"],
    },
  },
});
