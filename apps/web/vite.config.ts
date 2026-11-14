import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vercel serves from root — no subfolder prefix needed.
  base: "/",
  server: {
    port: 5173,
    host: true,
  },
});
