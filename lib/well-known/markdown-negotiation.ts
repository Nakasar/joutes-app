import { NodeHtmlMarkdown } from "node-html-markdown";

/**
 * La même page, en markdown, pour qui la demande.
 *
 * Un agent qui lit une page de Joutes reçoit aujourd'hui plusieurs dizaines de
 * kilo-octets de balisage, de scripts et de classes utilitaires pour quelques
 * lignes de contenu. Il paie ce bruit en jetons, et il y perd le fil. Un
 * en-tête `Accept: text/markdown` suffit désormais à recevoir le texte seul.
 *
 * Le HTML reste la réponse par défaut : rien ne change pour un navigateur, qui
 * ne demande jamais ce type. La négociation est déclarée dans
 * `next.config.ts`, qui n'aiguille ici que les requêtes portant cet en-tête.
 */

/** Ce que l'agent demande pour déclencher la conversion. */
export const MARKDOWN_MEDIA_TYPE = "text/markdown";

/** Ce qu'il reçoit. */
export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

/**
 * En-tête posé sur la requête interne qui va rechercher le HTML.
 *
 * La réécriture ne se déclenche que sur `Accept: text/markdown` et cette
 * requête-là demande du HTML : la boucle est déjà exclue. L'en-tête la rend
 * néanmoins reconnaissable dans les journaux, et sert de seconde barrière si
 * la condition de réécriture venait à s'élargir.
 */
export const MARKDOWN_SOURCE_HEADER = "x-markdown-source";

/**
 * Chemins que la conversion ne doit pas toucher.
 *
 * Les documents `.well-known`, `/auth.md` et l'API servent déjà ce qu'un agent
 * vient y chercher — du JSON, du markdown, un linkset. Les convertir
 * reviendrait à transformer du JSON en prose. La même liste est reprise dans
 * la réécriture de `next.config.ts` ; celle-ci est le filet de sécurité.
 */
export const MARKDOWN_NEGOTIATION_EXCLUDED = [
  "api/",
  "_next/",
  "\\.well-known/",
  "auth\\.md",
  "robots\\.txt",
  "sitemap",
].join("|");

export function isNegotiablePath(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname === "/api") return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/.well-known/")) return false;
  if (pathname === "/auth.md" || pathname === "/robots.txt") return false;
  if (pathname.startsWith("/sitemap")) return false;
  // Une extension de fichier désigne un asset, pas une page.
  return !/\.[a-z0-9]{2,5}$/i.test(pathname);
}

/**
 * Estimation du nombre de jetons, à environ quatre caractères par jeton.
 *
 * Il n'y a pas de nombre vrai : un jeton dépend du modèle qui découpe. Cette
 * valeur sert à budgéter avant de télécharger, usage pour lequel un ordre de
 * grandeur suffit. Compter juste demanderait d'embarquer un tokenizer, et d'en
 * choisir un — c'est-à-dire de se tromper pour tous les autres.
 */
export function estimateTokens(markdown: string): number {
  return Math.ceil([...markdown].length / 4);
}

/** Ce qui ne se lit pas : ni le code, ni le JSON d'hydratation de Next. */
const NEVER_READABLE = ["script", "style", "noscript", "svg", "template"];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Décode les entités d'un texte extrait à la regex.
 *
 * Le corps de la page passe par un analyseur HTML, qui s'en charge ; le titre,
 * non. Sans cela, un agent lit `Conditions Générales d&#x27;Utilisation` — le
 * genre de détail qui traverse ensuite tout ce qu'il en écrit.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Le titre du document, seule chose utile que `<head>` contienne. */
function documentTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  return title ? decodeEntities(title).replace(/\s+/g, " ") : null;
}

/**
 * Le contenu de la page, sans ce qui l'entoure.
 *
 * La mise en page range le contenu dans un `<main>` ; l'en-tête, la navigation
 * et le pied de page sont dehors. Les convertir aussi ferait payer à l'agent,
 * sur chaque page, le même menu et le même pied — le bruit qu'il venait
 * précisément éviter.
 *
 * Sans `<main>`, on convertit tout en écartant les repères de chrome : mieux
 * vaut une page bruyante qu'une page vide.
 */
function readableRegion(html: string): { html: string; ignore: string[] } {
  const main = /<main[^>]*>([\s\S]*)<\/main>/i.exec(html);

  return main
    ? { html: main[1], ignore: NEVER_READABLE }
    : { html, ignore: [...NEVER_READABLE, "header", "footer", "nav"] };
}

/**
 * La page en markdown.
 *
 * Le titre de `<title>` n'est ajouté que si le contenu n'a pas déjà son propre
 * titre de niveau 1 — sinon la page s'ouvre deux fois sur la même phrase, une
 * fois suivie du nom du site. La plupart des pages ont leur `<h1>` ; ce sont
 * les autres que ce repli sauve d'un markdown anonyme.
 */
export function htmlToMarkdown(html: string): string {
  const { html: region, ignore } = readableRegion(html);
  const body = NodeHtmlMarkdown.translate(region, { ignore }).trim();

  if (/^# /m.test(body)) return `${body}\n`;

  const title = documentTitle(html);
  return title ? `# ${title}\n\n${body}\n` : `${body}\n`;
}
