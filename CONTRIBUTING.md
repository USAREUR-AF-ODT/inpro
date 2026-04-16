# Contributing to inpro

Thanks for helping keep the guide accurate. This project is community-maintained — every correction saves another newcomer hours.

## Quick fixes (typos, broken links, outdated POCs)

1. Click the "Report outdated info" link at the bottom of the affected page, or open a GitHub issue with the `outdated-info` template.
2. If you can, link a T1 (official) source for the correction.

## New entries

Use the promote script to scaffold a published entry from a raw scrape, or write one by hand.

```bash
# Option A — from a raw scrape:
FIRECRAWL_API_KEY=... npm run scrape -- --topic housing
node scripts/promote.mjs src/content/raw/t1/housing/<file>.md

# Option B — copy an existing entry and edit:
cp src/content/published/housing/housing-services-office.md \
   src/content/published/housing/<new-slug>.md
```

Required frontmatter fields: `title`, `summary`, `topic`, `phase`, `last_verified`, at least one source in `sources[]`. See [README.md](README.md#content-model) for the full schema.

### Writing style

- **Facts only.** Not opinions. Not advice. Not "pro tips." See [CONTENT_STYLE.md](CONTENT_STYLE.md).
- **BLUF.** Bottom line up front. The most important thing goes in the summary.
- **Cite every factual claim.** If you can't find a source, mark the page `poc_volatile: true` and note what needs verification.
- **No quotes from closed Facebook groups or private Discord servers.** Context from those is fine to inform what you write; redistribution is not.

### Profile tags

Be generous with `any` — if a fact applies to most people, don't gate it behind a narrow filter. Only filter when the content would confuse or mislead someone in a different situation (e.g., OHA eligibility for contractors, child-specific content for singles).

## Pull request checklist

- [ ] `npm run audit` passes (no stale/invalid entries)
- [ ] `npm run verify-links` passes (no broken source URLs)
- [ ] `npm run build` succeeds locally
- [ ] Every new/changed entry has a `last_verified` date within the last 30 days
- [ ] `poc_volatile: true` entries cite at least one T1 source
- [ ] You haven't quoted closed-group content

## Reviewers

PRs are reviewed by `CODEOWNERS`. Factual corrections from multiple sources merge fast. Opinionated or ambiguous content will be pushed back or pared down.

## Maintainer commands

```bash
npm run audit                 # content lint
npm run verify-links          # HEAD-check sources
npm run static-maps           # pre-render offline POC maps
npm run scrape -- --dry-run   # preview scrape without API calls
```
