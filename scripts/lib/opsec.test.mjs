import { describe, it, expect } from 'vitest';
import {
  SSN_RE, DODID_RE, PASSPORT_RE, BANNED_RE, PERSONAL_EMAIL_DOMAINS,
  checkOpsec,
} from './opsec.mjs';

const e = (level, msgPart) => expect.objectContaining({ level, msg: expect.stringContaining(msgPart) });

describe('OPSEC regex', () => {
  it('SSN_RE matches xxx-xx-xxxx but not phone fragments', () => {
    expect('My SSN is 123-45-6789'.match(SSN_RE)).toEqual(['123-45-6789']);
    // US phone fragment 555-555-1212 should NOT match — it has trailing 4 digits
    expect('Call 555-55-1212 now'.match(SSN_RE)).toEqual(['555-55-1212']);
    // But a real phone won't match (4-digit trailing block)
    expect('Call 555-555-1212 now'.match(SSN_RE)).toEqual(null);
    // International / DSN should not trigger
    expect('+49-611-705-1234'.match(SSN_RE)).toEqual(null);
  });

  it('DODID_RE requires the literal token nearby', () => {
    const positives = [
      'DODID 1234567890',
      'EDIPI: 1234567890',
      'My DOD ID is 9876543210',
      'dodid    1111111111',
    ];
    for (const s of positives) expect([...s.matchAll(DODID_RE)].length).toBeGreaterThan(0);
    // Random 10-digit number without the token should not flag
    expect([...'phone 1234567890'.matchAll(DODID_RE)].length).toBe(0);
  });

  it('PASSPORT_RE matches both letter+8 and 9-digit forms with the keyword', () => {
    expect([...'passport A12345678'.matchAll(PASSPORT_RE)].length).toBe(1);
    expect([...'Passport No: 123456789'.matchAll(PASSPORT_RE)].length).toBe(1);
    expect([...'passport number Z00000001'.matchAll(PASSPORT_RE)].length).toBe(1);
    // Without the keyword nearby
    expect([...'A12345678 is just an order number'.matchAll(PASSPORT_RE)].length).toBe(0);
  });

  it('BANNED_RE matches classification / caveat tokens at word boundaries', () => {
    expect([...'This is SECRET stuff'.matchAll(BANNED_RE)].length).toBe(1);
    expect([...'TOP SECRET filing'.matchAll(BANNED_RE)].length).toBe(1);
    expect([...'CUI//SP-PROVHLTH for ref'.matchAll(BANNED_RE)].length).toBe(1);
    expect([...'NOFORN reasons'.matchAll(BANNED_RE)].length).toBe(1);
    // Should NOT match casual prose
    expect([...'tell me your secrets'.matchAll(BANNED_RE)].length).toBe(0);
    expect([...'a secrets manager'.matchAll(BANNED_RE)].length).toBe(0);
    // Case sensitivity — banned strings are uppercase only
    expect([...'fouo'.matchAll(BANNED_RE)].length).toBe(0);
  });
});

describe('checkOpsec()', () => {
  it('returns no issues on clean input', () => {
    const fm = { sources: [{ tier: 'T1', url: 'https://home.army.mil/x', label: 'X' }] };
    const body = 'In-processing happens at Building 1023 on Clay Kaserne.';
    expect(checkOpsec(fm, body)).toEqual([]);
  });

  it('flags an SSN in the body', () => {
    const issues = checkOpsec({}, 'My SSN is 123-45-6789 do not share');
    expect(issues).toEqual([e('error', 'SSN-like pattern')]);
  });

  it('skips SSN-shaped patterns on lines with phone/dsn context', () => {
    expect(checkOpsec({}, 'phone: 555-55-1212 ext')).toEqual([]);
    expect(checkOpsec({}, 'DSN 314-55-1212')).toEqual([]);
    expect(checkOpsec({}, 'Kontakt: 314-55-1212')).toEqual([]);
  });

  it('flags DODID/EDIPI', () => {
    const issues = checkOpsec({}, 'EDIPI 1234567890');
    expect(issues).toEqual([e('error', 'DODID/EDIPI')]);
  });

  it('flags passport-shaped value near "passport"', () => {
    const issues = checkOpsec({}, 'My passport A12345678 was lost');
    expect(issues).toEqual([e('error', 'passport-number-shaped')]);
  });

  it('flags banned classification tokens', () => {
    expect(checkOpsec({}, 'this is FOUO material')).toEqual([e('error', 'FOUO')]);
    expect(checkOpsec({}, 'CUI//SP-PROVHLTH applies')).toEqual([e('error', 'CUI//SP-PROVHLTH')]);
  });

  it('flags personal-email domains in poc[]', () => {
    const fm = { poc: [{ name: 'X', email: 'someone@gmail.com' }] };
    expect(checkOpsec(fm, '')).toEqual([e('warn', 'personal-email domain in POC')]);
  });

  it('does not flag .mil / .gov POC emails', () => {
    const fm = { poc: [{ name: 'HSO', email: 'usarmy.wiesbaden.imcom-eur.list.dpw-housing@army.mil' }] };
    expect(checkOpsec(fm, '')).toEqual([]);
  });

  it('flags personal apex as source URL', () => {
    const fm = { sources: [{ tier: 'T3', url: 'https://blogger.gmail.com/post', label: 'random' }] };
    expect(checkOpsec(fm, '')).toEqual([e('warn', 'personal domain as source')]);
  });

  it('handles missing fm gracefully', () => {
    expect(checkOpsec(null, 'no SSN here')).toEqual([]);
    expect(checkOpsec(undefined, '')).toEqual([]);
    expect(checkOpsec({}, '')).toEqual([]);
  });

  it('handles malformed source URL gracefully', () => {
    const fm = { sources: [{ tier: 'T3', url: 'not a url', label: 'x' }] };
    expect(checkOpsec(fm, '')).toEqual([]);
  });

  it('aggregates multiple issues from a single body', () => {
    const body = `
      EDIPI 1234567890 was assigned.
      Passport A99999999 expires.
      Filed under TOP SECRET handling.
    `;
    const issues = checkOpsec({}, body);
    expect(issues.length).toBe(3);
    expect(issues.map(i => i.level)).toEqual(['error', 'error', 'error']);
  });
});

describe('PERSONAL_EMAIL_DOMAINS', () => {
  it('covers the major US + German free providers', () => {
    for (const d of ['gmail.com', 'yahoo.com', 'gmx.de', 'web.de', 't-online.de', 'proton.me']) {
      expect(PERSONAL_EMAIL_DOMAINS.has(d)).toBe(true);
    }
  });
  it('does not contain official .mil / .gov domains', () => {
    for (const d of ['army.mil', 'tricare.mil', 'usa.gov', 'wiesbaden.de']) {
      expect(PERSONAL_EMAIL_DOMAINS.has(d)).toBe(false);
    }
  });
});
