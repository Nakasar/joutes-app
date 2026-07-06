import {NextResponse} from "next/server";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";

export const SITEMAP_LIMIT = 10000;

export async function generateSitemaps() {
  const games = await db.collection<Game>('games').find({}, { projection: { slug: 1, features: 1 } }).toArray();

  const cardsForGames = await Promise.all(games.filter(g => g.features?.cards).map(async g => {
    return { count: await db.collection('cards').countDocuments({ gameId: g._id }), gameSlug: g.slug };
  }));

  const ids = cardsForGames.map(g => {
    return Array.from({ length: Math.ceil(g.count / SITEMAP_LIMIT) }).map((_, i) => ({
      id: `${g.gameSlug}---${i}`,
    }));
  });

  return ids.flat();
}

function buildSitemapIndex(sitemaps: string[]) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  for (const sitemapURL of sitemaps) {
    xml += "<sitemap>";
    xml += `<loc>${sitemapURL}</loc>`;
    xml += "</sitemap>";
  }

  xml += "</sitemapindex>";
  return xml;
}

export async function GET() {
  try {
    // Generate sitemaps
    const dynamicSitemaps = await generateSitemaps();

    // Combine static and dynamic sitemaps
    const sitemaps = [
      `https://www.joutes.app/sitemap.xml`,
      ...dynamicSitemaps.map(sitemap => `https://www.joutes.app/sitemaps/${sitemap.id}.xml`),
    ];

    console.log('Generated sitemaps:', sitemaps);

    const sitemapIndexXML = buildSitemapIndex(sitemaps);

    return new NextResponse(sitemapIndexXML, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Length": Buffer.byteLength(sitemapIndexXML).toString(),
      },
    });
  } catch (error) {
    console.error('Error generating sitemap index:', error);
    return NextResponse.error();
  }
}