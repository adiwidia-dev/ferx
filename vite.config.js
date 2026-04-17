import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from '@tailwindcss/vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const isVitest = !!process.env.VITEST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    tailwindcss(),
    sveltekit()
  ],

  resolve: isVitest ? { conditions: ["browser"] } : undefined,

  build: {
    // Tauri on macOS runs inside WKWebView (Safari 16+). Target a single
    // engine so esbuild can emit the smallest JS possible.
    target: ['safari15', 'es2021'],
    // Source maps bloat the bundle and leak internal paths in production.
    sourcemap: false,
    // Default minifier (esbuild) is fine and much faster than terser.
    minify: 'esbuild',
    cssMinify: true,
    // Computing gzip sizes on every build slows down tauri build noticeably.
    reportCompressedSize: false,
    // Keep asset inlining modest so we don't blow up the entry chunk.
    assetsInlineLimit: 4096,
  },

  test: {
    environmentMatchGlobs: [
      ["**/*.svelte.test.ts", "jsdom"],
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
