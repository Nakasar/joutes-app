/**
 * Robots refusés par le proxy, avant tout rendu.
 *
 * `robots.txt` (`lib/well-known/robots.ts`) le leur demande aussi, mais il
 * n'est relu qu'avec retard, et pas par tous : ce refus s'applique tout de suite.
 *
 * Kevin a demandé (2026-11-22) d'écarter tous les robots d'IA, qu'ils
 * entraînent un modèle ou répondent à un utilisateur, sauf ceux des principaux
 * moteurs de recherche, et de leur laisser le serveur MCP. Déclencheur :
 * Meta-ExternalAgent a parcouru les fiches de cartes du 21 au 22 nov. 2026,
 * ~46 000 requêtes et ~2,6 Go sortis en 18 heures.
 */

/**
 * Jetons d'agent des robots d'IA, cherchés dans le `User-Agent` sans tenir
 * compte de la casse. Restent admis, à dessein : Googlebot, Bingbot, Applebot,
 * DuckDuckBot, YandexBot, Baiduspider (moteurs de recherche), et
 * facebookexternalhit (aperçus des liens partagés sur Facebook, Instagram,
 * WhatsApp). Aucun jeton ci-dessous n'est contenu dans le leur.
 */
export const AI_BOT_AGENTS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Claude-Web",
  "anthropic-ai",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Meta (pas facebookexternalhit)
  "meta-externalagent",
  "meta-externalfetcher",
  "meta-webindexer",
  "FacebookBot",
  // Google, hors Googlebot
  "GoogleOther",
  "Google-CloudVertexBot",
  "Gemini-Deep-Research",
  // Autres
  "Amazonbot",
  "Bytespider",
  "TikTokSpider",
  "CCBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "MistralAI-User",
  "DuckAssistBot",
  "YouBot",
  "PhindBot",
  "Diffbot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "ImagesiftBot",
  "Timpibot",
  "omgili",
  "PanguBot",
  "Kangaroo Bot",
  "iaskspider",
  "FirecrawlAgent",
];

/**
 * Jetons propres à `robots.txt` : aucun robot ne les envoie comme agent, ils
 * disent seulement à Google et Apple de ne pas servir leurs IA de ce que
 * Googlebot et Applebot lisent pour la recherche.
 */
export const AI_ROBOTS_TXT_TOKENS = ["Google-Extended", "Applebot-Extended"];

/**
 * Robots sans intérêt pour Joutes, refusés partout, MCP compris :
 * SERankingBacklinksBot (analyse de liens) a pesé ~1,5 Go les 9-10 nov. 2026.
 */
export const BLOCKED_BOT_AGENTS = ["SERankingBacklinksBot"];

/**
 * Adresses laissées aux robots d'IA : le serveur MCP et ce dont sa connexion
 * dépend (découverte OAuth, routes better-auth d'autorisation et de jeton).
 * `/mcp` et `/.well-known` ne passent de toute façon pas par le proxy
 * (`config.matcher` de `proxy.ts`) ; la page de consentement est ouverte par
 * le navigateur de l'utilisateur, pas par le robot.
 */
const MCP_PATH = /^\/(?:mcp|\.well-known|api\/auth)(?:\/|$)/;

function tokens(list: string[]): RegExp {
  return new RegExp(list.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}

const AI_BOT = tokens(AI_BOT_AGENTS);
const BLOCKED_BOT = tokens(BLOCKED_BOT_AGENTS);

export function isAiBot(userAgent: string | null): boolean {
  return !!userAgent && AI_BOT.test(userAgent);
}

/** Vrai si le proxy doit refuser cette requête à ce robot. */
export function isBlockedBot(pathname: string, userAgent: string | null): boolean {
  if (!userAgent) return false; // l'app mobile n'envoie pas toujours d'agent
  if (BLOCKED_BOT.test(userAgent)) return true;
  return isAiBot(userAgent) && !MCP_PATH.test(pathname);
}
