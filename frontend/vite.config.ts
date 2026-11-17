import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind v4 runs as a Vite plugin, so there is no tailwind.config.js to create.
  plugins: [react(), tailwindcss()],
  // Must match CLIENT_ORIGIN in backend/.env, or the browser blocks API calls (CORS).
  server: { port: 5173 },
});
