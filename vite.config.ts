import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localApi } from "./server/local-api.ts";
export default defineConfig({
  plugins: [react(), localApi()],
  server: { host: "localhost", port: 5173, strictPort: true },
});
