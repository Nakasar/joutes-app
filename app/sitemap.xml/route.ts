import { CGU_LAST_UPDATED, PRIVACY_LAST_UPDATED } from "@/lib/constants/legal";

const urls = [
  { url: 'https://www.joutes.app', lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  { url: 'https://www.joutes.app/features', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  { url: 'https://www.joutes.app/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  { url: 'https://www.joutes.app/games/riftbound', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/rules', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/rules/cr', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/rules/tr', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/cards', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/policies', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/deck-checker', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/developers', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound/developers/mcp', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  { url: 'https://www.joutes.app/games/riftbound/developers/discord', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  { url: 'https://www.joutes.app/games/riftbound/developers/api', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  { url: 'https://www.joutes.app/games', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: 'https://www.joutes.app/lairs', lastModified: new Date(), changeFrequency: 'daily', priority: 0.5 },
  { url: 'https://www.joutes.app/events', lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  { url: 'https://www.joutes.app/integrations', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  { url: 'https://www.joutes.app/integrations/mcp', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  { url: 'https://www.joutes.app/integrations/api', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  { url: 'https://www.joutes.app/integrations/discord', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  // Les documents légaux portent la date de leur version, pas celle de la requête.
  { url: 'https://www.joutes.app/cgu', lastModified: new Date(CGU_LAST_UPDATED), changeFrequency: 'yearly', priority: 0.1 },
  { url: 'https://www.joutes.app/privacy', lastModified: new Date(PRIVACY_LAST_UPDATED), changeFrequency: 'yearly', priority: 0.1 },
];

export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ url, lastModified, changeFrequency, priority }) => `  <url>
    <loc>${url}</loc>
    <lastmod>${lastModified.toISOString()}</lastmod>
    <changefreq>${changeFrequency}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}