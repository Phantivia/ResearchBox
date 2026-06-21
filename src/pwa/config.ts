import {
  PAPER_IMAGE_CACHE_MAX_AGE_SECONDS,
  PAPER_IMAGE_CACHE_MAX_ENTRIES,
  PAPER_IMAGES_CACHE_NAME,
} from "../core/cache/constants";

export const PWA_MANIFEST = {
  name: "ResearchBox",
  short_name: "ResearchBox",
  description: "Academic paper research toolbox — offline-first PWA",
  theme_color: "#2563eb",
  background_color: "#ffffff",
  display: "standalone" as const,
  start_url: "./#/",
  scope: "./",
  icons: [
    {
      src: "icons/icon-64x64.png",
      sizes: "64x64",
      type: "image/png",
    },
    {
      src: "icons/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "icons/icon-maskable-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export const PWA_WORKBOX_RUNTIME_CACHING = [
  {
    urlPattern: /^https:\/\/(arxiv\.org|ar5iv\.org|.*\.arxiv\.org)\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i,
    handler: "CacheFirst" as const,
    options: {
      cacheName: PAPER_IMAGES_CACHE_NAME,
      expiration: {
        maxEntries: PAPER_IMAGE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: PAPER_IMAGE_CACHE_MAX_AGE_SECONDS,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
];

export { PAPER_IMAGES_CACHE_NAME, PAPER_IMAGE_CACHE_MAX_AGE_SECONDS, PAPER_IMAGE_CACHE_MAX_ENTRIES };
