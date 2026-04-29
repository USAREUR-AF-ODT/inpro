import { describe, it, expect } from 'vitest';
import { matchProfile, type Profile, type ProfileTags } from './matchProfile';

describe('matchProfile', () => {
  describe('bypass paths', () => {
    it('returns true when tags is undefined', () => {
      expect(matchProfile(undefined, { status: 'soldier' })).toBe(true);
    });

    it('returns true when profile is null (no profile set)', () => {
      const tags: ProfileTags = { status: ['soldier'] };
      expect(matchProfile(tags, null)).toBe(true);
    });

    it('returns true when profile.showAll is set', () => {
      const tags: ProfileTags = { status: ['daciv'] };
      const profile: Profile = { status: 'soldier', showAll: true };
      expect(matchProfile(tags, profile)).toBe(true);
    });

    it('returns true when tags is empty object', () => {
      expect(matchProfile({}, { status: 'soldier' })).toBe(true);
    });
  });

  describe('status array', () => {
    it('matches when profile.status is in the tag list', () => {
      const tags: ProfileTags = { status: ['soldier', 'daciv'] };
      expect(matchProfile(tags, { status: 'soldier' })).toBe(true);
      expect(matchProfile(tags, { status: 'daciv' })).toBe(true);
    });

    it('does not match when profile.status is absent from the tag list', () => {
      const tags: ProfileTags = { status: ['soldier'] };
      expect(matchProfile(tags, { status: 'family' })).toBe(false);
    });

    it("matches anyone when tags include 'any'", () => {
      const tags: ProfileTags = { status: ['any'] };
      expect(matchProfile(tags, { status: 'soldier' })).toBe(true);
      expect(matchProfile(tags, { status: 'contractor' })).toBe(true);
    });

    it("matches when tags is the default ['any']", () => {
      const tags: ProfileTags = { status: ['any'], rank: ['any'] };
      expect(matchProfile(tags, { status: 'family', rank: 'GS' })).toBe(true);
    });

    it('matches when profile.status is unset (filter only narrows when profile says something)', () => {
      const tags: ProfileTags = { status: ['soldier'] };
      expect(matchProfile(tags, {})).toBe(true);
    });
  });

  describe('rank array', () => {
    it('matches when profile.rank is in the multi-rank tag list', () => {
      const tags: ProfileTags = { rank: ['E1-E4', 'E5-E6'] };
      expect(matchProfile(tags, { rank: 'E5-E6' })).toBe(true);
      expect(matchProfile(tags, { rank: 'E1-E4' })).toBe(true);
    });

    it('does not match when profile.rank is outside the list', () => {
      const tags: ProfileTags = { rank: ['CO-FG'] };
      expect(matchProfile(tags, { rank: 'E1-E4' })).toBe(false);
    });
  });

  describe('ternary fields', () => {
    it('matches when tag is "yes" and profile is "yes"', () => {
      const tags: ProfileTags = { has_kids: 'yes' };
      expect(matchProfile(tags, { has_kids: 'yes' })).toBe(true);
    });

    it('does not match when tag is "yes" but profile is "no"', () => {
      const tags: ProfileTags = { has_kids: 'yes' };
      expect(matchProfile(tags, { has_kids: 'no' })).toBe(false);
    });

    it('does not match when tag is "no" but profile is "yes"', () => {
      const tags: ProfileTags = { has_pets: 'no' };
      expect(matchProfile(tags, { has_pets: 'yes' })).toBe(false);
    });

    it('matches when profile says "any" regardless of tag', () => {
      const tags: ProfileTags = { has_pov: 'yes' };
      expect(matchProfile(tags, { has_pov: 'any' })).toBe(true);
    });

    it('matches when tag says "any" regardless of profile', () => {
      const tags: ProfileTags = { has_pov: 'any' };
      expect(matchProfile(tags, { has_pov: 'no' })).toBe(true);
    });

    it('matches when profile field is unset', () => {
      const tags: ProfileTags = { has_kids: 'yes' };
      expect(matchProfile(tags, {})).toBe(true);
    });

    it('rejects only when ALL of (tag set, profile set, mismatch)', () => {
      const tags: ProfileTags = { accompanied: 'yes' };
      // unset profile field → match
      expect(matchProfile(tags, { status: 'soldier' })).toBe(true);
      // matching profile field → match
      expect(matchProfile(tags, { accompanied: 'yes' })).toBe(true);
      // mismatched profile field → no match
      expect(matchProfile(tags, { accompanied: 'no' })).toBe(false);
    });
  });

  describe('combined fields', () => {
    it('all-match returns true', () => {
      const tags: ProfileTags = {
        status: ['soldier'],
        rank: ['E5-E6'],
        accompanied: 'yes',
        has_kids: 'yes',
      };
      const profile: Profile = {
        status: 'soldier',
        rank: 'E5-E6',
        accompanied: 'yes',
        has_kids: 'yes',
      };
      expect(matchProfile(tags, profile)).toBe(true);
    });

    it('any-mismatch returns false', () => {
      const tags: ProfileTags = {
        status: ['soldier'],
        rank: ['E5-E6'],
        accompanied: 'yes',
      };
      const profile: Profile = {
        status: 'soldier',
        rank: 'E5-E6',
        accompanied: 'no',
      };
      expect(matchProfile(tags, profile)).toBe(false);
    });

    it("a single 'any' tag does not whitelist mismatched siblings", () => {
      const tags: ProfileTags = {
        status: ['any'],
        rank: ['E5-E6'],
      };
      expect(matchProfile(tags, { status: 'family', rank: 'GS' })).toBe(false);
    });
  });
});
