import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
  plugins: [dts({ tsconfigPath: "./tsconfig.build.json", entryRoot: "src", exclude: ["src/**/*.test.*"] })],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index", cssFileName: "styles" },
    rollupOptions: { external: ["react", "react/jsx-runtime", "vue", "@personai/agent-ui-motion-core", "@personai/agent-ui-motion-core/styles.css"] },
  },
});
