import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { unknown } from "vite-plugin-unknown";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    unknown({
      extension: ".test",
      transform: (code) => {
        return `export default ${JSON.stringify(code)}`;
      },
    }),
  ],
});
