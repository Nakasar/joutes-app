import "server-only";

/**
 * Bluesky, côté réseau.
 *
 * Une seule requête, sur une seule adresse, sans clé ni compte : l'AppView
 * publique répond aux `app.bsky.*` non authentifiés, et c'est l'hôte que la
 * documentation recommande pour un usage web public — il est mis en cache de
 * leur côté.
 *
 * C'est l'exact opposé du dossier YouTube, où chaque appel compte contre un
 * quota. Ici, rien à ménager qu'une limitation par adresse IP — et celle d'une
 * fonction Vercel est **partagée** avec d'autres. D'où le sondage séquentiel de
 * l'orchestrateur, comme `game-lives` : rien à gagner à cogner en parallèle.
 *
 * Ce module rend le **corps brut**. La mise en forme est dans
 * `bluesky-feed.ts`, qui est pur et donc testé sur une réponse réelle — même
 * coupe qu'entre `fetchYouTubeChannelFeed` et `readYouTubeFeed`.
 */

const AUTHOR_FEED_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed";

/** L'agent que nous annonçons, sur le modèle de `lib/news/fetch-source.ts`. */
const USER_AGENT = "JoutesSocialCollector/1.0 (+https://joutes.app)";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Combien de publications on demande à un compte.
 *
 * Cinquante, et pas les cent que l'API accepte : la contrainte vient de la
 * rétention, pas de la plateforme. Un jeu garde cent publications toutes
 * sources confondues ; en moissonner cent chez Bluesky plus quinze chez YouTube
 * ferait purger à chaque tour ce que le suivant recollecterait. Voir
 * `GAME_SOCIAL_KEEP`.
 */
export const BLUESKY_FEED_LIMIT = 50;

/**
 * Le flux d'un compte, tel que l'AppView le rend.
 *
 * Ne jette jamais : un compte injoignable est une chose qui arrive, et elle ne
 * doit pas emporter le tour des autres. `null` dit « on n'a pas su lire », ce
 * que l'orchestrateur distingue soigneusement de « le compte n'a rien publié » —
 * le premier interdit tout ménage, le second non.
 */
export async function fetchBlueskyAuthorFeed(
  actor: string,
  limit: number = BLUESKY_FEED_LIMIT,
): Promise<unknown | null> {
  const url = new URL(AUTHOR_FEED_URL);
  url.searchParams.set("actor", actor);
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 100))));
  // Le filtre retire les réponses, mais **pas les reposts** : aucune valeur ne
  // le fait, et un nom inventé ne lève même pas d'erreur. Le tri des reposts se
  // fait donc dans `readBlueskyFeed`, qui revérifie aussi les réponses.
  url.searchParams.set("filter", "posts_no_replies");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "Lecture du flux Bluesky refusée:",
        actor,
        response.status,
        (await response.text()).slice(0, 200),
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Flux Bluesky injoignable:", actor, error);
    return null;
  }
}
