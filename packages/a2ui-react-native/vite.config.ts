import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.build.json",
      entryRoot: "src",
      exclude: ["src/**/*.test.*"],
    }),
  ],
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "@personai/agent-ui-a2ui-core",
        "react",
        "react/jsx-runtime",
        "react-native",
      ],
    },
  },
});