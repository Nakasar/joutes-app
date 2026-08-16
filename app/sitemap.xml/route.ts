import db from "@/lib/mongodb";
import { CGU_LAST_UPDATED, PRIVACY_LAST_UPDATED } from "@/lib/constants/legal";
import type { Game } from "@/lib/types/Game";
import { type SitemapUrl, gamesSitemapUrls } from "@/lib/games/sitemap";

const SITE = "https://www.joutes.app";

/**
 * Sitemap principal : les pages de la plateforme, et celles de chaque jeu.
 *
 * Les pages d'un jeu ne sont plus écrites à la main. Elles se déduisent de ses
 * fonctionnalités (`lib/games/sitemap.ts`), comme sa barre d'outils : activer
 * les produits d'un jeu déclare sa page produits, et l'ancienne liste fixe ne
 * décrivait que riftbound — les autres jeux n'existaient pour un moteur que par
 * les liens qui pointaient vers eux.
 *
 * Restent écrites à la main les pages qui n'appartiennent à aucun jeu, et
 * celles que riftbound est seul à porter (routes statiques, sans équivalent
 * sous `[gameSlugOrId]`).
 */
const staticUrls: {
  url: string;
  lastModified: Date;
  // Le même vocabulaire que les pages calculées : une fréquence mal
  // orthographiée passerait sinon jusque dans le XML.
  changeFrequency: SitemapUrl["changeFrequency"];
  priority: number;
}[] = [
  { url: `${SITE}`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  { url: `${SITE}/features`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  { url: `${SITE}/features/organizers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  { url: `${SITE}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  { url: `${SITE}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  // Pages propres à riftbound : leurs routes sont statiques, aucun autre jeu ne
  // les ouvre, et le vérificateur de deck n'existe pas sous `[gameSlugOrId]`.
  { url: `${SITE}/games/riftbound/deck-checker`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE}/games/riftbound/developers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
  { url: `${SITE}/games/riftbound/developers/mcp`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  { url: `${SITE}/games/riftbound/developers/discord`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  { url: `${SITE}/games/riftbound/developers/api`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  { url: `${SITE}/games`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE}/lairs`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.5 },
  { url: `${SITE}/events`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  { url: `${SITE}/integrations`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  { url: `${SITE}/integrations/mcp`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  { url: `${SITE}/integrations/api`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  { url: `${SITE}/integrations/discord`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.2 },
  // Les documents légaux portent la date de leur version, pas celle de la requête.
  { url: `${SITE}/cgu`, lastModified: new Date(CGU_LAST_UPDATED), changeFrequency: 'yearly', priority: 0.1 },
  { url: `${SITE}/privacy`, lastModified: new Date(PRIVACY_LAST_UPDATED), changeFrequency: 'yearly', priority: 0.1 },
];

/**
 * Pages de jeux, calculées à partir des fanions de chaque jeu.
 *
 * Les quiz et l'actualité ne dépendent d'aucun fanion : on demande à la base
 * quels jeux en ont, plutôt que d'annoncer des pages vides. Deux `distinct` de
 * plus, sur des collections bien plus petites que celle des cartes.
 */
async function gameUrls(): Promise<SitemapUrl[]> {
  const games = await db
    .collection<Game>('games')
    .find({}, { projection: { slug: 1, features: 1 } })
    .toArray();

  const [quizGameIds, newsGameIds] = await Promise.all([
    db.collection('quizzes').distinct('gameId'),
    db.collection('news').distinct('gameIds'),
  ]);

  const withQuizzes = new Set(quizGameIds.map((id) => String(id)));
  const withNews = new Set(newsGameIds.map((id) => String(id)));

  return gamesSitemapUrls(
    games.map((game) => {
      const id = String(game._id);
      return {
        id,
        slug: game.slug,
        features: game.features,
        hasQuizzes: withQuizzes.has(id),
        hasNews: withNews.has(id),
      };
    })
  );
}

export async function GET() {
  const now = new Date();
  const urls = [
    ...staticUrls,
    // Une page de jeu change au rythme de son contenu : la date de la requête
    // est ce qu'on sait de plus juste sans interroger chaque page.
    ...(await gameUrls()).map((entry) => ({
      url: `${SITE}${entry.path}`,
      lastModified: now,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
  ];

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
