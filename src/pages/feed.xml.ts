import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { TOPIC_LABEL, PHASE_LABEL, type Topic, type Phase } from '../lib/tags';

export async function GET(context: APIContext) {
  const entries = await getCollection('published');
  const sorted = entries
    .filter((e) => !e.data.stub)
    .sort((a, b) => (b.data.last_verified || '').localeCompare(a.data.last_verified || ''));

  return rss({
    title: 'inpro — Wiesbaden PCS guide',
    description: 'Unofficial, community-maintained PCS information portal for Wiesbaden, Germany.',
    site: context.site ?? 'http://localhost:4321',
    items: sorted.map((e) => ({
      title: e.data.title,
      pubDate: new Date(e.data.last_verified),
      description: e.data.summary,
      link: `/entries/${e.slug}`,
      categories: [
        TOPIC_LABEL[e.data.topic as Topic],
        PHASE_LABEL[e.data.phase as Phase],
      ],
    })),
    customData: `<language>en-us</language>`,
  });
}
