import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import AstroPWA from '@vite-pwa/astro';
import tailwindcss from '@tailwindcss/vite';

const SITE = process.env.SITE_URL ?? 'https://example.github.io';
const BASE = process.env.SITE_BASE ?? '/inpro';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'never',
  integrations: [
    sitemap(),
    icon({ include: { lucide: ['*'] } }),
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'og-default.png', 'icons/*', 'offline.html', 'maps/*'],
      manifest: {
        name: 'inpro — Wiesbaden PCS',
        short_name: 'inpro',
        description: 'Unofficial PCS info portal for Wiesbaden.',
        theme_color: '#7A2A3E',
        background_color: '#F6EFE1',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE + '/',
        scope: BASE + '/',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,css,js,svg,png,webp,woff2,json,webmanifest,txt}'],
        // Pagefind self-fetches its chunked index at runtime; precaching it bloats install
        // size and freezes a stale corpus across deploys. Same for the .pf_* hash files.
        globIgnores: ['**/pagefind/**', '**/*.pf_*'],
        navigateFallback: BASE + '/offline',
        // Don't serve the offline shell for non-routes (typo'd entry slugs, /api, etc.).
        navigateFallbackDenylist: [/\/api\//, /\/pagefind\//, /\/\.well-known\//, /\.[a-z0-9]+$/i],
        runtimeCaching: [
          {
            urlPattern: /\/_astro\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'astro-assets',
              expiration: { maxEntries: 200 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
