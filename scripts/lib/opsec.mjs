/**
 * OPSEC pattern library shared by audit-content.mjs (and tests).
 * Pure: no I/O, no globals. Caller wires file paths and severities.
 */

export const SSN_RE = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g;
export const DODID_RE = /\b(?:DODID|EDIPI|DOD\s*ID)\b[^\n]{0,40}?(\d{10})\b/gi;
export const PHONE_HINT_RE = /(?:phone|tel|fax|dsn|hotline|kontakt)[^\n]{0,12}/i;
// US passport: one letter + 8 digits, OR 9 digits (book-style). Require the literal
// "passport" token to avoid false positives on tracking/order numbers.
export const PASSPORT_RE = /\bpassport\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z]\d{8}|\d{9})\b/gi;

// Banned classification / OPSEC handling-caveat strings. These should never appear
// in published content. Word boundaries keep "secrets manager" etc. clean.
const BANNED_STRINGS = [
  '\\bSECRET\\b',
  '\\bTOP\\s+SECRET\\b',
  '\\bCONFIDENTIAL\\b',
  '\\bCUI//[A-Z][A-Z-]*',
  '\\bNOFORN\\b',
  '\\bFOUO\\b',
  '\\bORCON\\b',
  '\\bOPDATA\\b',
];
export const BANNED_RE = new RegExp(`(?:${BANNED_STRINGS.join('|')})`, 'g');

export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.de', 'web.de', 't-online.de',
]);

/**
 * Scan a parsed frontmatter object + body string and return OPSEC issues.
 * @param {object} fm    parsed frontmatter (poc[], sources[] used)
 * @param {string} body  raw markdown body (frontmatter already stripped)
 * @returns {Array<{level: 'error'|'warn', msg: string}>}
 */
export function checkOpsec(fm, body) {
  const issues = [];

  // SSN-like patterns. Skip lines that look like phone/dsn context.
  for (const line of body.split('\n')) {
    if (PHONE_HINT_RE.test(line)) continue;
    for (const m of line.matchAll(SSN_RE)) {
      issues.push({ level: 'error', msg: `OPSEC: SSN-like pattern "${m[0]}"` });
    }
  }

  // DODID/EDIPI requires the literal token nearby to avoid phone-number FP.
  for (const m of body.matchAll(DODID_RE)) {
    issues.push({ level: 'error', msg: `OPSEC: DODID/EDIPI followed by 10-digit "${m[1]}"` });
  }

  // US passport number near the literal "passport" keyword.
  for (const m of body.matchAll(PASSPORT_RE)) {
    issues.push({ level: 'error', msg: `OPSEC: passport-number-shaped value near "passport" keyword "${m[1]}"` });
  }

  // Banned classification / handling-caveat strings.
  for (const m of body.matchAll(BANNED_RE)) {
    issues.push({ level: 'error', msg: `OPSEC: banned classification string "${m[0]}"` });
  }

  // Personal email domains in POC contacts.
  for (const poc of fm?.poc ?? []) {
    if (!poc?.email) continue;
    const domain = String(poc.email).split('@').pop()?.toLowerCase();
    if (domain && PERSONAL_EMAIL_DOMAINS.has(domain)) {
      issues.push({ level: 'warn', msg: `OPSEC: personal-email domain in POC "${poc.email}"` });
    }
  }

  // Personal email apex domains used as source URLs.
  for (const src of fm?.sources ?? []) {
    if (!src?.url) continue;
    try {
      const host = new URL(src.url).hostname.toLowerCase();
      const apex = host.split('.').slice(-2).join('.');
      if (PERSONAL_EMAIL_DOMAINS.has(apex)) {
        issues.push({ level: 'warn', msg: `OPSEC: personal domain as source "${src.url}"` });
      }
    } catch { /* unparseable URL — skip */ }
  }

  return issues;
}
