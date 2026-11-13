/**
 * `robots.txt`, et les préférences d'usage du contenu qu'il déclare.
 *
 * Les Content Signals (https://contentsignals.org/) disent ce qu'on accepte
 * qu'il soit fait du contenu de Joutes, là où `Allow` / `Disallow` ne disaient
 * que qui pouvait le lire. Joutes ouvre les trois : le site expose déjà une API
 * publique et un serveur MCP, autant que la déclaration le dise.
 *
 * La directive est une ligne de groupe, comme `Allow` : hors d'un bloc
 * `User-Agent`, elle serait ignorée sans le moindre avertissement.
 */

/** Préférences déclarées, dans l'ordre où la spécification les présente. */
export const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=yes";

/**
 * La méta (`/games/:jeu/meta` et ses sous-pages) est fermée aux robots : ses
 * filtres se combinent sans fin et chaque adresse recalcule les statistiques.
 * PerplexityBot en a tiré 117 000 en deux jours (9-10 nov. 2026, ~15 Go sortis
 * de nos fonctions). Le proxy les refuse aussi (`lib/net/meta-bots.ts`).
 * La route de l'app mobile (`/api/games/:jeu/meta`) n'est fermée que par cette
 * consigne et son cache de cinq minutes : le refus du proxy écarterait aussi
 * l'app, qui n'envoie pas toujours d'agent.
 */
export const META_DISALLOWS = ["/games/*/meta", "/*/games/*/meta", "/api/games/*/meta"];

/**
 * Robots sans intérêt pour Joutes, qui parcourent tout le site : SE Ranking
 * (outil d'analyse de liens) a pesé ~1,5 Go les mêmes jours.
 */
export const BLOCKED_AGENTS = ["SERankingBacklinksBot"];

const SITEMAPS = [
  "https://www.joutes.app/sitemap.xml",
  "https://www.joutes.app/sitemap_index.xml",
];

export function buildRobotsTxt(): string {
  return `# Content Signals — préférences d'usage du contenu (https://contentsignals.org/).
#   search   : indexer le contenu et le restituer en résultats de recherche
#              (liens et courts extraits), résumés générés exclus.
#   ai-input : donner le contenu à un modèle au moment de répondre
#              (RAG, ancrage, réponses de recherche générative).
#   ai-train : entraîner ou affiner un modèle.
# Joutes autorise les trois.

User-Agent: *
Content-Signal: ${CONTENT_SIGNAL}
Allow: /
Disallow: /admin/
${META_DISALLOWS.map((path) => `Disallow: ${path}`).join("\n")}

${BLOCKED_AGENTS.map((agent) => `User-Agent: ${agent}\nDisallow: /`).join("\n\n")}

${SITEMAPS.map((sitemap) => `Sitemap: ${sitemap}`).join("\n")}`;
}
