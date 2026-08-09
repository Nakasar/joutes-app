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

${SITEMAPS.map((sitemap) => `Sitemap: ${sitemap}`).join("\n")}`;
}
