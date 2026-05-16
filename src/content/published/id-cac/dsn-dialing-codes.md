---
title: DSN and Civilian Dialing Codes: Wiesbaden
summary: How to convert any USAG Wiesbaden DSN to a civilian number (and vice versa), plus how to dial Germany from the US and DSN from outside Europe.
topic: id-cac
phase: before
usag: wiesbaden
profile_tags:
  status:
    - any
sources:
  - tier: T1
    url: https://home.army.mil/wiesbaden/contact
    label: USAG Wiesbaden Contact Page
    score:
      authority: 5
      currency: 5
      accuracy: 3
      purpose: 5
      license: 5
  - tier: T1
    url: https://home.army.mil/wiesbaden/5417/1396/5081/2024_WELCOME_PACKET.pdf
    label: USAG Wiesbaden 2024 Welcome Packet (PDF)
    scraped: '2026-04-16'
    score:
      authority: 5
      currency: 5
      accuracy: 3
      purpose: 5
      license: 5
last_verified: '2026-04-16'
poc_volatile: false
order: 5
---

## What

A DSN (Defense Switched Network) number is what appears in most garrison directories. Civilians; including you, once you're on a German SIM; can't dial DSN directly. Every USAG Wiesbaden DSN converts to a civilian German number using a fixed prefix.

Save these conversions on your phone before you arrive.

## DSN → civilian conversion

| DSN prefix | Civilian prefix (from Germany) |
|---|---|
| `334-2XXX` / `521-XXXX` | `(06134) 604` + last three digits of DSN |
| `334-4XXX` | `(0611) 508` + last three digits of DSN |
| `335-5XXX` | `(0611) 4080` + last three digits of DSN |
| `336-XXXX` | `(0611) 816-XXXX` |
| `337-5XXX` | `(0611) 705-XXXX` |
| `338-7XXX` | `(0611) 380-XXXX` |
| `347-3XXX` | `(06155) 603-XXX` |
| `523-XXXX` | `(0611) 143-523-XXXX` |
| `537-XXXX` | `(0611) 143-537-XXXX` |
| `546-XXXX` | `(0611) 143-546-XXXX` |
| `548-XXXX` | `(0611) 143-548-XXXX` |
| `570-XXXX` | `(0611) 9744-XXXX` |
| `590-XXXX` (ARHC / medical) | `(06371) 9464-XXXX` |

The `548-` prefix is the most common; it covers ACS, HSO, DES, IOC, Vehicle Registration, and many other garrison offices. If you see `DSN 548-XXXX`, the civilian equivalent is `(0611) 143-548-XXXX`.

## Dialing Germany from the US

**From anywhere in the US to a German landline or mobile**:
Dial `011 49` + the German number *without* the first `0`.

Example: `(0611) 143-548-7777` becomes `011 49 611 143 548 7777`.

## Dialing Germany from Europe (outside Germany)

Dial `00 49` + German number without the first `0`.

Example: `(0611) 143-548-7777` becomes `00 49 611 143 548 7777`.

## Dialing DSN from outside Europe

Dial `314` + the seven-digit DSN.

Example: `DSN 548-7777` becomes `314 548 7777`.

## Reverse lookup (civilian → DSN)

If a civilian number starts with `(0611) 143-`, the DSN is the last seven digits formatted as `xxx-xxxx`. Example: `(0611) 143-548-9201` → `DSN 548-9201`.

## Contact

This page is a reference; no POC. If a number isn't working, call the operator at **DSN 548-3003** / `(0611) 143-548-3003` (Installation Operations Center).

## Gotchas

- **German SIM, calling a DSN number directly; won't work.** Use the civilian conversion.
- **Landline `0611` is the Wiesbaden city code.** Some sub-garrisons (Mainz-Kastel, Flugplatz Erbenheim) use the same code; others (Wiesbaden Army Airfield, some training sites) use different codes like `06134` or `06155`.
- **Always drop the leading `0`** when dialing Germany from outside (both US `011 49` and EU `00 49`).
- **Skype / WhatsApp / iMessage** via Wi-Fi works on Clay Kaserne. Most family members keep their US number on a Wi-Fi calling plan as a backup during settle-in.
- **US 800 numbers generally don't work from Germany.** Use the international alt lines (e.g. TRICARE Overseas: `+00-800-4444-8844`).

## Source notes

See the Sources panel below. Prefix tables confirmed against the garrison contact page and 2024 Welcome Packet. Prefix ranges rarely change; individual numbers shift more often.
