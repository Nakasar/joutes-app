/**
 * Le cache des fichiers que seuls les robots lisent : `robots.txt` et les
 * plans de site.
 *
 * Sans cet en-tête, chaque lecture relançait une fonction et ses requêtes en
 * base (4 à 9 s mesurées sur les plans de site). Une heure au CDN, puis la
 * copie périmée est servie pendant qu'une nouvelle se calcule : un moteur n'a
 * pas besoin de mieux, et il explore moins un site qui lui répond lentement.
 */
export const CRAWLER_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
