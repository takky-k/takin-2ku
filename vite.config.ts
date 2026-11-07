import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/takin-2ku/",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          core: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          data: ["dexie", "dexie-react-hooks", "zod"],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "takin' 2ku",
        short_name: "takin' 2ku",
        lang: "ja",
        description: "ローカルファーストの筋トレ記録",
        theme_color: "#101010",
        background_color: "#101010",
        display: "standalone",
        scope: "/takin-2ku/",
        start_url: "/takin-2ku/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
