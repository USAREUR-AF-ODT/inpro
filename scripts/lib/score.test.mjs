import { describe, it, expect } from 'vitest';
import {
  scoreAuthority, scoreCurrency, scoreAccuracy, scorePurpose, scoreLicense, scoreSource,
} from './score.mjs';

const src = (tier, url) => ({ tier, url, label: 'x' });
const FIXED_TODAY = new Date('2026-04-29T00:00:00Z');

describe('scoreAuthority', () => {
  it('5 for T1 .mil/.gov', () => {
    expect(scoreAuthority(src('T1', 'https://home.army.mil/x'))).toBe(5);
    expect(scoreAuthority(src('T1', 'https://www.dodea.edu/y'))).toBe(5);
    expect(scoreAuthority(src('T1', 'https://www.fvap.gov/'))).toBe(5);
  });
  it('4 for T2 + federal-contracted', () => {
    expect(scoreAuthority(src('T2', 'https://installations.militaryonesource.mil/x'))).toBe(4);
    expect(scoreAuthority(src('T1', 'https://www.tricare-overseas.com/y'))).toBe(4);
  });
  it('2 for T4 (German municipal)', () => {
    expect(scoreAuthority(src('T4', 'https://www.wiesbaden.de/x'))).toBe(2);
  });
  it('1 for T3 community', () => {
    expect(scoreAuthority(src('T3', 'https://www.reddit.com/r/army'))).toBe(1);
  });
});

describe('scoreCurrency', () => {
  it('5 for ≤90d', () => {
    expect(scoreCurrency('2026-04-01', FIXED_TODAY)).toBe(5);
  });
  it('4 for 91–180d', () => {
    expect(scoreCurrency('2025-12-01', FIXED_TODAY)).toBe(4);
  });
  it('3 for 181d–1y', () => {
    expect(scoreCurrency('2025-08-01', FIXED_TODAY)).toBe(3);
  });
  it('2 for 1y–2y', () => {
    expect(scoreCurrency('2025-01-01', FIXED_TODAY)).toBe(2);
  });
  it('1 for >2y or undated', () => {
    expect(scoreCurrency('2023-01-01', FIXED_TODAY)).toBe(1);
    expect(scoreCurrency(undefined, FIXED_TODAY)).toBe(1);
    expect(scoreCurrency('not a date', FIXED_TODAY)).toBe(1);
  });
});

describe('scoreAccuracy', () => {
  it('5 for ≥2 distinct hosts incl T1', () => {
    expect(scoreAccuracy([
      src('T1', 'https://home.army.mil/x'),
      src('T2', 'https://installations.militaryonesource.mil/y'),
    ])).toBe(5);
  });
  it('4 for ≥2 hosts no T1', () => {
    expect(scoreAccuracy([
      src('T2', 'https://installations.militaryonesource.mil/y'),
      src('T4', 'https://www.wiesbaden.de/z'),
    ])).toBe(4);
  });
  it('3 for single T1', () => {
    expect(scoreAccuracy([src('T1', 'https://home.army.mil/x')])).toBe(3);
  });
  it('3 for two URLs same host with T1', () => {
    expect(scoreAccuracy([
      src('T1', 'https://home.army.mil/x'),
      src('T1', 'https://home.army.mil/y'),
    ])).toBe(3);
  });
  it('1 for empty / no T1', () => {
    expect(scoreAccuracy([])).toBe(1);
    expect(scoreAccuracy([src('T3', 'https://blog.example.com/x')])).toBe(1);
  });
});

describe('scorePurpose', () => {
  it('5 for T1 public-service', () => {
    expect(scorePurpose(src('T1', 'https://home.army.mil'))).toBe(5);
  });
  it('4 for T4 foreign gov', () => {
    expect(scorePurpose(src('T4', 'https://www.wiesbaden.de'))).toBe(4);
  });
  it('3 for T2 commercial-aligned', () => {
    expect(scorePurpose(src('T2', 'https://installations.militaryonesource.mil'))).toBe(3);
  });
  it('1 for T3 community', () => {
    expect(scorePurpose(src('T3', 'https://reddit.com/x'))).toBe(1);
  });
});

describe('scoreLicense', () => {
  it('5 for .mil/.gov public domain', () => {
    expect(scoreLicense(src('T1', 'https://home.army.mil/x'))).toBe(5);
    expect(scoreLicense(src('T2', 'https://installations.militaryonesource.mil/y'))).toBe(5);
  });
  it('3 for foreign-gov / commercial-aligned', () => {
    expect(scoreLicense(src('T4', 'https://www.wiesbaden.de/x'))).toBe(3);
  });
  it('1 for community', () => {
    expect(scoreLicense(src('T3', 'https://blog.example.com/x'))).toBe(1);
  });
});

describe('scoreSource (end-to-end)', () => {
  it('returns a complete scorecard', () => {
    const s = src('T1', 'https://home.army.mil/wiesbaden/housing');
    const all = [s, src('T2', 'https://installations.militaryonesource.mil/x')];
    const score = scoreSource(s, { lastVerified: '2026-04-01', allSources: all, today: FIXED_TODAY });
    expect(score).toEqual({
      authority: 5, currency: 5, accuracy: 5, purpose: 5, license: 5,
    });
  });
  it('falls back gracefully on bad input', () => {
    const score = scoreSource(src('T3', 'not-a-url'), { lastVerified: undefined, today: FIXED_TODAY });
    expect(score.authority).toBe(1);
    expect(score.currency).toBe(1);
  });
});
