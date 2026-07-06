export function GET() {
  const content = `User-Agent: *
Allow: /
Disallow: /admin/
Sitemap: https://www.joutes.app/sitemap.xml
Sitemap: https://www.joutes.app/sitemap_index.xml`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}