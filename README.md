# inpro

Unofficial, offline-capable PCS info portal for Wiesbaden, Germany.

> Not affiliated with the US Army, DoD, or USAG Wiesbaden. Community-maintained.

## What this is

A static site that answers the questions nobody puts in the welcome packet: housing, finance, ID/CAC, schools, medical, legal, vehicle registration, family services, German bureaucracy, and the lived-experience gotchas that only show up after you arrive.

- No tracking, no accounts, no PII
- Offline-capable (PWA) after first visit
- Profile-aware — filters content to your situation (Soldier / Civilian / Family, rank, accompanied status, kids, POV, pets)

## Stack

- [Astro](https://astro.build/) 5 + content collections (Zod-typed markdown)
- Tailwind v4 (CSS-first config)
- [Pagefind](https://pagefind.app/) — client-side, offline-capable search
- [`@vite-pwa/astro`](https://vite-pwa-org.netlify.app/frameworks/astro.html) — Workbox-powered service worker
- [Firecrawl](https://www.firecrawl.dev/) — content scrape pipeline (local dev, not CI)
- Self-hosted fonts (Source Serif 4 Variable, Inter, JetBrains Mono)
- Cloudflare Web Analytics — aggregate, no cookies

## Local development

```bash
cp .env.example .env        # add FIRECRAWL_API_KEY if scraping; CF token for analytics
npm install
npm run dev                 # http://localhost:4321
npm run dev -- --host       # expose LAN IP for real-device testing
```

### Production build + search index

```bash
npm run build               # runs astro build + pagefind
npm run preview
```

### Content pipeline

```bash
# 1. Scrape target URLs into src/content/_raw/
FIRECRAWL_API_KEY=... npm run scrape
npm run scrape -- --tier T1 --topic housing
npm run scrape -- --dry-run

# 2. Promote a raw entry to a published entry (interactive)
node scripts/promote.mjs src/content/_raw/t1/housing/home-army-mil--housing.md

# 3. Lint published content (stale dates, missing fields)
npm run audit

# 4. HEAD-check every sources[].url
npm run verify-links

# 5. Pre-render offline POC maps
npm run static-maps
```

## Repo layout

```
src/
  content/
    config.ts          ← Zod schema
    published/         ← ships to prod (curated)
    raw/               ← scraper output (reviewable in PRs)
  layouts/             ← BaseLayout, TopicLayout
  components/          ← Card, MapEmbed, SourceList, …
  islands/             ← profile store/picker/filter (vanilla TS)
  pages/               ← dynamic routes for phase, topic, entry
  styles/              ← tokens.css + global.css
scripts/
  targets.yml          ← scrape target list
  scrape.mjs           ← Firecrawl orchestrator
  promote.mjs          ← raw → published helper
  audit-content.mjs    ← content lint
  verify-links.mjs     ← source URL HEAD checks
  static-maps.mjs      ← OSM offline map renderer
```

## Content model

Every published entry is a markdown file with frontmatter:

```yaml
---
title: "..."
summary: "..."
topic: housing            # housing|finance|medical|legal|vehicle|id-cac|family|schools|pets|religious|mwr|unit
phase: arrive             # before|arrive|settle|life|sponsors
usag: wiesbaden
profile_tags:
  status: [soldier, family]
  rank: [any]
  accompanied: any
  has_kids: any
  has_pov: any
  has_pets: any
poc:
  - name: "Housing Office"
    phone: "+49-611-..."
    dsn: "548-...."
    maps_query: "Clay Kaserne Wiesbaden"
    hours: "Mon–Fri 0800–1600"
sources:
  - {tier: T1, url: "https://...", label: "USAG Wiesbaden Housing"}
last_verified: "2026-04-16"
poc_volatile: true
---

## What
## Where
## When
## Contact
## Gotchas
## Sources
```

Source tiers:
- **T1** Official Army / DoD / TRICARE / DoDEA / USAG
- **T2** Semi-official (MilOneSource, AFN, Stars & Stripes)
- **T3** Community (blogs, Reddit, public-facing FB)
- **T4** German-side (Stadt, ADAC, Bürgeramt)

Closed FB groups are **research context only** — we read them to identify common pain points, never quote or republish.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Found something wrong? Use the "Report outdated info" link at the bottom of any page, or open an issue.

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. Every push to `main` rebuilds and deploys. Pagefind index is built in CI.

## License

- **Code**: MIT ([LICENSE](LICENSE))
- **Content** in `src/content/published/`: CC-BY-SA 4.0 ([LICENSE-content](LICENSE-content))
