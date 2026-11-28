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
 *
 * Deux exceptions, décidées par Kevin le 2026-11-28 : OAI-SearchBot (la
 * recherche de ChatGPT) et Claude-User (une lecture demandée par un
 * utilisateur de Claude) sont admis, parce qu'ils amènent des visites. Ils ne
 * figurent donc plus dans la liste. Amzn-SearchBot, lui, y entre.
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
  // Anthropic
  "ClaudeBot",
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
  "Amzn-SearchBot",
  "Amzn-User",
  "ExaBot",
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
 * Robots sans intérêt pour Joutes, refusés partout, MCP compris : les outils
 * d'analyse SEO commerciaux. Ils alimentent des rapports payants, pas un
 * moteur de recherche : les refuser ne change rien au classement dans Google
 * ou Bing. SERankingBacklinksBot a pesé ~1,5 Go les 9-10 nov. 2026 ; Semrush,
 * Ahrefs, ShapBot et Barkrowler ~3 000 requêtes la semaine du 21 nov. 2026.
 */
export const BLOCKED_BOT_AGENTS = [
  "SERankingBacklinksBot",
  "SemrushBot",
  "AhrefsBot",
  "ShapBot",
  "Barkrowler",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
  "BLEXBot",
  "serpstatbot",
];

/**
 * Moteurs de recherche gardés mais priés de ralentir (`Crawl-delay`, en
 * secondes, dans `robots.txt`). PetalBot a fait 12 000 requêtes en une
 * semaine, Yandex 1 650 en un jour. La consigne n'engage que ceux qui la
 * suivent : PetalBot et Bing oui, Google non (il règle son rythme seul).
 */
export const SLOWED_BOT_AGENTS: Record<string, number> = { PetalBot: 10, YandexBot: 10 };

/**
 * Bibliothèques HTTP et outils en ligne de commande : sur une page du site,
 * ce n'est jamais un lecteur. Cherchés en tête d'agent.
 */
const SCRIPT_AGENT = /^(?:python-requests|python-urllib|python-httpx|aiohttp|curl|wget|go-http-client|okhttp|axios|node-fetch|node|undici|scrapy|libwww-perl|java|ruby|php|guzzlehttp|httpclient|restsharp|postmanruntime|insomnia)\b/i;

/**
 * Ce que le refus des scripts ne touche pas : l'API (l'app mobile et les
 * intégrations n'envoient pas toujours d'agent), le serveur MCP, les fichiers
 * de découverte, et les fichiers faits pour être lus par une machine.
 */
const MACHINE_PATH = /^\/(?:api|mcp|discord)(?:\/|$)|\/\.well-known(?:\/|$)|\.(?:md|txt|xml|json)$/;

/**
 * Vrai pour une page demandée sans agent, ou par une bibliothèque HTTP : les
 * scripts de collecte les plus simples. Aucun moteur de recherche ni aperçu de
 * lien n'est concerné, tous se nomment.
 */
export function isScriptOnPage(pathname: string, userAgent: string | null): boolean {
  if (MACHINE_PATH.test(pathname)) return false;
  return !userAgent?.trim() || SCRIPT_AGENT.test(userAgent.trim());
}

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
  if (isScriptOnPage(pathname, userAgent)) return true;
  if (!userAgent) return false; // sur l'API, l'app mobile n'envoie pas toujours d'agent
  if (BLOCKED_BOT.test(userAgent)) return true;
  return isAiBot(userAgent) && !MCP_PATH.test(pathname);
}
