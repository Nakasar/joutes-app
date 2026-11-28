/**
 * `robots.txt`, et les préférences d'usage du contenu qu'il déclare.
 *
 * Les Content Signals (https://contentsignals.org/) disent ce qu'on accepte
 * qu'il soit fait du contenu de Joutes, là où `Allow` / `Disallow` ne disaient
 * que qui pouvait le lire. Joutes ouvre la recherche et ferme l'IA
 * (entraînement comme réponses, Kevin, 2026-11-22) ; les robots d'IA gardent le
 * serveur MCP, qui est fait pour eux.
 *
 * La directive est une ligne de groupe, comme `Allow` : hors d'un bloc
 * `User-Agent`, elle serait ignorée sans le moindre avertissement.
 */

import { AI_BOT_AGENTS, AI_ROBOTS_TXT_TOKENS, BLOCKED_BOT_AGENTS, SLOWED_BOT_AGENTS } from "@/lib/net/blocked-bots";

/** Préférences déclarées, dans l'ordre où la spécification les présente. */
export const CONTENT_SIGNAL = "search=yes, ai-input=no, ai-train=no";

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
 * Robots refusés sur tout le site, aussi refusés par le proxy
 * (`lib/net/blocked-bots.ts`) : SE Ranking (outil d'analyse de liens) a pesé
 * ~1,5 Go les mêmes jours.
 */
export const BLOCKED_AGENTS = BLOCKED_BOT_AGENTS;

/**
 * Robots d'IA (entraînement et réponses), fermés au site sauf le serveur MCP,
 * à la demande de Kevin (2026-11-22). Le proxy les refuse aussi.
 */
export const AI_AGENTS = [...AI_BOT_AGENTS, ...AI_ROBOTS_TXT_TOKENS];

/** Ce que les robots d'IA gardent : le serveur MCP et sa découverte OAuth. */
export const AI_ALLOWS = ["/mcp", "/.well-known/"];

const SITEMAPS = [
  "https://www.joutes.app/sitemap.xml",
  "https://www.joutes.app/sitemap_index.xml",
];

/** Ce que tout robot admis doit éviter : l'administration et la méta. */
const COMMON_DISALLOWS = ["/admin/", ...META_DISALLOWS];

/**
 * Les moteurs priés de ralentir. Un robot ne lit que le groupe le plus précis
 * qui le nomme : chaque groupe reprend donc les règles de `*`.
 */
function slowedGroups(): string {
  return Object.entries(SLOWED_BOT_AGENTS)
    .map(
      ([agent, seconds]) =>
        `User-Agent: ${agent}\nContent-Signal: ${CONTENT_SIGNAL}\nCrawl-delay: ${seconds}\nAllow: /\n${COMMON_DISALLOWS.map((path) => `Disallow: ${path}`).join("\n")}`,
    )
    .join("\n\n");
}

export function buildRobotsTxt(): string {
  return `# Content Signals — préférences d'usage du contenu (https://contentsignals.org/).
#   search   : indexer le contenu et le restituer en résultats de recherche
#              (liens et courts extraits), résumés générés exclus.
#   ai-input : donner le contenu à un modèle au moment de répondre
#              (RAG, ancrage, réponses de recherche générative).
#   ai-train : entraîner ou affiner un modèle.
# Joutes autorise la recherche, pas l'IA : les robots d'IA n'ont que le
# serveur MCP (/mcp).

User-Agent: *
Content-Signal: ${CONTENT_SIGNAL}
Allow: /
${COMMON_DISALLOWS.map((path) => `Disallow: ${path}`).join("\n")}

${slowedGroups()}

${AI_AGENTS.map((agent) => `User-Agent: ${agent}`).join("\n")}
Content-Signal: ${CONTENT_SIGNAL}
${AI_ALLOWS.map((path) => `Allow: ${path}`).join("\n")}
Disallow: /

${BLOCKED_AGENTS.map((agent) => `User-Agent: ${agent}\nDisallow: /`).join("\n\n")}

${SITEMAPS.map((sitemap) => `Sitemap: ${sitemap}`).join("\n")}`;
}
