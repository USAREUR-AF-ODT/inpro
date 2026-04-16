import { defineCollection, z } from 'astro:content';

const topic = z.enum([
  'housing', 'finance', 'medical', 'legal', 'vehicle',
  'id-cac', 'family', 'schools', 'pets', 'religious', 'mwr', 'unit',
]);
const phase = z.enum(['before', 'arrive', 'settle', 'life', 'sponsors']);
const status = z.enum(['soldier', 'daciv', 'contractor', 'family', 'any']);
const rank = z.enum(['E1-E4', 'E5-E6', 'E7-E9', 'WO', 'CO-FG', 'GS', 'any']);
const ternary = z.enum(['yes', 'no', 'any']);

const profile_tags = z.object({
  status: z.array(status).default(['any']),
  rank: z.array(rank).default(['any']),
  accompanied: ternary.default('any'),
  has_kids: ternary.default('any'),
  has_pov: ternary.default('any'),
  has_pets: ternary.default('any'),
}).default({});

const poc = z.object({
  name: z.string(),
  phone: z.string().optional(),
  dsn: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  maps_query: z.string().optional(),
  hours: z.string().optional(),
});

const source = z.object({
  tier: z.enum(['T1', 'T2', 'T3', 'T4']),
  url: z.string().url(),
  label: z.string(),
  scraped: z.string().optional(),
});

export const collections = {
  published: defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      summary: z.string().max(280),
      topic,
      phase,
      usag: z.literal('wiesbaden').default('wiesbaden'),
      profile_tags,
      poc: z.array(poc).optional(),
      sources: z.array(source).default([]),
      last_verified: z.string(),
      poc_volatile: z.boolean().default(false),
      order: z.number().default(100),
      stub: z.boolean().default(false),
    }),
  }),
};
