const urls = [
  { url: 'https://www.joutes.app', lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  { url: 'https://www.joutes.app/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: 'https://www.joutes.app/games/riftbound', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: 'https://www.joutes.app/games', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: 'https://www.joutes.app/lairs', lastModified: new Date(), changeFrequency: 'daily', priority: 0.5 },
  { url: 'https://www.joutes.app/events', lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  { url: 'https://tools.joutes.app', lastModified: new Date(), changeFrequency: 'daily', priority: 0.4 },
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