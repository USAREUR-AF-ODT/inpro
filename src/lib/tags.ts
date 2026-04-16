export const TOPICS = [
  'housing', 'finance', 'medical', 'legal', 'vehicle',
  'id-cac', 'family', 'schools', 'pets', 'religious', 'mwr', 'unit',
] as const;
export type Topic = typeof TOPICS[number];

export const TOPIC_LABEL: Record<Topic, string> = {
  housing: 'Housing',
  finance: 'Finance',
  medical: 'Medical & Dental',
  legal: 'Legal',
  vehicle: 'Vehicle & POV',
  'id-cac': 'ID & CAC',
  family: 'Family Services',
  schools: 'Schools & EFMP',
  pets: 'Pets',
  religious: 'Religious Services',
  mwr: 'MWR & Recreation',
  unit: 'Unit Integration',
};

export const PHASES = ['before', 'arrive', 'settle', 'life', 'sponsors'] as const;
export type Phase = typeof PHASES[number];

export const PHASE_LABEL: Record<Phase, string> = {
  before: 'Before You Move',
  arrive: 'When You Arrive',
  settle: 'Getting Settled',
  life: 'Life in Wiesbaden',
  sponsors: 'Sponsors',
};

export const STATUSES = ['soldier', 'daciv', 'contractor', 'family', 'any'] as const;
export type Status = typeof STATUSES[number];

export const STATUS_LABEL: Record<Status, string> = {
  soldier: 'Soldier',
  daciv: 'DA Civilian',
  contractor: 'Contractor',
  family: 'Family Member',
  any: 'Any',
};

export const RANKS = ['E1-E4', 'E5-E6', 'E7-E9', 'WO', 'CO-FG', 'GS', 'any'] as const;
export type Rank = typeof RANKS[number];

export const TIERS = ['T1', 'T2', 'T3', 'T4'] as const;
export type Tier = typeof TIERS[number];

export const TIER_LABEL: Record<Tier, string> = {
  T1: 'Official',
  T2: 'Semi-official',
  T3: 'Community',
  T4: 'German-side',
};
