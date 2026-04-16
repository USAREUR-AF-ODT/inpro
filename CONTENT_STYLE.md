# Content style guide

Core rule: **inpro is an information portal, not a blog.** Write what newcomers need to know, cite the source, move on.

## Voice

- **BLUF.** Summary carries the one-sentence answer. Body fills in where/when/how.
- **Second person.** "You" beats "arrivees."
- **Active, concrete, specific.** "Call HSO the morning you arrive" beats "It is recommended that inprocessees establish contact with the Housing Services Office in a timely manner."
- **Short sentences.** Vary rhythm. Mix lengths. Avoid the "not X, it's Y" pattern.
- **No AI tells.** No "here's the thing," "let that sink in," "it turns out," or "this matters because." No em-dashes used for dramatic effect. No rhetorical contrasts.

## Scope

- **Facts only, with sources.** Every claim about policy, eligibility, timelines, dollar amounts, or POCs gets a T1 or T2 source link.
- **No recommendations, no opinions** outside the designated "Life in Wiesbaden" opinionated sections (restaurants, travel). Those are clearly marked.
- **No scare stories or hype.** Gotchas are written as "here's the rule" not "don't be the idiot who …"
- **No quotes from closed groups.** Paraphrase from public sources only.

## Required page sections

Every topic entry has these six sections. Omit a heading only if it truly doesn't apply.

- **What** — One paragraph. The thing. What it is, who's covered.
- **Where** — Building, installation, address. Include parking/access tips if relevant.
- **When** — Hours, deadlines, windows. Use 24-hour for duty-day times.
- **Contact** — Use the `poc` frontmatter; POC cards render automatically. Profile-specific guidance goes here wrapped in `<div data-profile='…'>`.
- **Gotchas** — Bulleted. Each bullet is one mistake to avoid or one thing people miss. Lead with the rule, follow with the why.
- **Sources** — Short note. The footer renders the `sources[]` panel automatically.

## Profile tags — when to narrow

- Leave `any` as default. Narrow only when content would confuse or mislead the wrong audience.
- Rank bands gate housing priority, quarters type, and some entitlements. Don't over-gate.
- `has_kids: yes` for anything kid-specific that would waste a single Soldier's time.
- `accompanied: yes` for OHA eligibility, family quarters, TLA extensions.

## `poc_volatile` flag

Set `poc_volatile: true` when:
- Phone numbers or DSN change more than yearly
- Building locations have moved in the past 2 years
- Staffing or hours shift with TDA changes

Entries with this flag render a "Verify before acting" pill and require at least one T1 source.

## Stale content

`npm run audit` flags anything with `last_verified` older than 60 days. Touch the file, confirm the content is still accurate, bump the date. Do not bump dates you haven't verified.

## Banned phrases

No:
- "Here's the thing"
- "It turns out"
- "Pro tip"
- "The reality is"
- "At the end of the day"
- "A word to the wise"
- "Navigate" as a verb for abstract processes
- "Leverage" (use)
- "Robust" (say what you actually mean)

## Formatting

- Headings: `##` for sections, `###` for POC cards or sub-sections. No `####`.
- Lists: `-` for unordered. `1.` for numbered procedures.
- Links: `[text](url)` inline; add to `sources[]` frontmatter for citation pills.
- Numbers: spell out under 10 unless they're identifiers or dollar amounts.
- Dates: ISO (`2026-04-16`) in frontmatter. Human format ("April 2026") in prose.
- German words: italicize first use (*Anmeldung*), normal case after.
- Military acronyms: spell out first use (HSO, Housing Services Office), then use bare.
