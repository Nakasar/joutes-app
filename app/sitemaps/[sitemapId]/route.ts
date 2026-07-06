import {getGameBySlugOrId} from "@/lib/db/games";
import db from "@/lib/mongodb";
import {BoosterCard} from "@/lib/types/booster";
import {ObjectId} from "mongodb";
import {DateTime} from "luxon";
import {SITEMAP_LIMIT} from "@/app/sitemap_index.xml/route";
import {NextRequest} from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ sitemapId: string }> }) {
  const { sitemapId } = await params;

  const [slug, index] = sitemapId.split('---');

  const game = await getGameBySlugOrId(slug);
  if (!game) {
    return [];
  }

  const cards = await db.collection<Pick<BoosterCard, "id">>('cards').find({
    gameId: new ObjectId(game.id),
  }, { projection: { id: 1 } }).skip(Number(index) * SITEMAP_LIMIT).limit(SITEMAP_LIMIT).toArray();

  const urls = cards.map((card) => ({
    url: `https://www.joutes.app/games/${slug}/cards/${card.id}`,
    lastModified: DateTime.now(),
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ url, lastModified, changeFrequency, priority }) => `  <url>
    <loc>${url}</loc>
    <lastmod>${lastModified.toISO()}</lastmod>
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