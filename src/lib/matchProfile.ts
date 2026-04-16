import type { Status, Rank } from './tags';

export type Ternary = 'yes' | 'no' | 'any';

export interface Profile {
  status?: Status;
  rank?: Rank;
  accompanied?: Ternary;
  has_kids?: Ternary;
  has_pov?: Ternary;
  has_pets?: Ternary;
  showAll?: boolean;
}

export interface ProfileTags {
  status?: Status[];
  rank?: Rank[];
  accompanied?: Ternary;
  has_kids?: Ternary;
  has_pov?: Ternary;
  has_pets?: Ternary;
}

/** Returns true if the content's profile_tags match the user's profile. */
export function matchProfile(tags: ProfileTags | undefined, profile: Profile | null): boolean {
  if (!tags || !profile || profile.showAll) return true;

  if (tags.status?.length && !tags.status.includes('any')) {
    if (profile.status && !tags.status.includes(profile.status)) return false;
  }
  if (tags.rank?.length && !tags.rank.includes('any')) {
    if (profile.rank && !tags.rank.includes(profile.rank)) return false;
  }
  for (const k of ['accompanied', 'has_kids', 'has_pov', 'has_pets'] as const) {
    const t = tags[k];
    const p = profile[k];
    if (!t || t === 'any') continue;
    if (p && p !== 'any' && p !== t) return false;
  }
  return true;
}
