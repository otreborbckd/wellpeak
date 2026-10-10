import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// La app se instala como ícono en iPhone y Android (PWA); no se publica en tiendas.
export default defineConfig({
  root: "app",
  envDir: "..",
  build: { outDir: "../dist", emptyOutDir: true },
  // En desarrollo (npm run dev) las llamadas /api van al servidor de PULSE (npm run dev:api)
  server: { proxy: { "/api": "http://localhost:3000" } },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "logos/*.svg"],
      manifest: {
        name: "PULSE · WellPeak",
        short_name: "PULSE",
        description: "Clima organizacional, microlearning y bienestar",
        lang: "es-MX",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B0B0C",
        theme_color: "#0B0B0C",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        // Nunca se guardan en caché llamadas a la API ni archivos privados
        navigateFallbackDenylist: [/^\/api/]
      }
    })
  ]
});
