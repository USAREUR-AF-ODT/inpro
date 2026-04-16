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
      includeAssets: ['favicon.svg', 'icons/*', 'offline.html', 'maps/*'],
      manifest: {
        name: 'inpro — Wiesbaden PCS',
        short_name: 'inpro',
        description: 'Unofficial PCS info portal for Wiesbaden.',
        theme_color: '#6E1E2A',
        background_color: '#F7F1E3',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE + '/',
        scope: BASE + '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,css,js,svg,png,webp,woff2,json,webmanifest,txt}'],
        navigateFallback: BASE + '/offline',
        runtimeCaching: [
          {
            urlPattern: /\/_astro\//,
            handler: 'CacheFirst',
            options: { cacheName: 'astro-assets', expiration: { maxEntries: 200 } },
          },
          {
            urlPattern: /^https:\/\/static\.cloudflareinsights\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'cf-insights' },
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
