/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
import { PWA_MANIFEST, PWA_WORKBOX_RUNTIME_CACHING } from "./src/pwa/config";

const PAGES_BASE = "/ResearchBox/";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? PAGES_BASE : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "logo.svg", "mini_logo.svg"],
      manifest: PWA_MANIFEST,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: PWA_WORKBOX_RUNTIME_CACHING,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
}));
