import { parse, type HTMLElement } from "node-html-parser";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { locales, type Locale } from "@/i18n/config";

/**
 * Extraction du corps d'un article depuis la page HTML d'un site extérieur.
 *
 * Rien ici ne touche au réseau ni à la base : le module reçoit du HTML et une
 * URL, et rend un brouillon d'actualité. C'est ce qui le rend testable —
 * `article-extraction.test.ts` lui donne des pages entières et vérifie ce qui
 * en sort.
 */

export type ExtractedArticle = {
  title: string;
  summary: string;
  /** Image de couverture déclarée par la page (`og:image`), si elle en a une. */
  bannerUrl?: string;
  /** Le site d'où vient l'article, tel qu'il se nomme lui-même. */
  sourceName: string;
  /**
   * La langue déclarée par la page, quand c'en est une que Joutes parle.
   * Sert à proposer la bonne langue d'origine au brouillon — un site officiel
   * publie le même article par langue, chacun sous son adresse.
   */
  lang?: Locale;
  /** Le corps de l'article, en markdown, images comprises. */
  markdown: string;
};

/** Bornes du schéma des actualités (`lib/schemas/news.schema.ts`). */
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 500;

/**
 * Balises qui ne portent jamais le corps d'un article : scripts, styles,
 * formulaires, cadres et navigation. Les retirer avant de noter les candidats
 * évite qu'un menu long ne pèse plus lourd que le texte.
 */
const NOISE_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "form",
  "input",
  "select",
  "textarea",
  "button",
  "nav",
  "aside",
  "footer",
];

/**
 * Blocs reconnaissables à leur classe ou leur identifiant, et dont on sait
 * qu'ils entourent l'article sans en faire partie. La liste reste étroite à
 * dessein : un mot trop général (« content », « main ») supprimerait
 * l'article lui-même sur certains sites. Ce qui n'est pas listé ici n'est pas
 * supprimé, seulement pénalisé au moment de la notation.
 */
const NOISE_CLASS_PATTERN =
  /(^|[^a-z])(cookie|consent|newsletter|subscribe|share|social|breadcrumb|related|recommend|advert|sponsor|popup|skip-link|site-nav|sitenav|navbar)([^a-z]|$)/i;

/** Classes qui trahissent au contraire le corps d'un article. */
const POSITIVE_CLASS_PATTERN = /(article|body|content|entry|post|story|text|rich)/i;

/** Classes qui trahissent l'habillage autour de l'article. */
const NEGATIVE_CLASS_PATTERN =
  /(nav|menu|sidebar|footer|header|comment|share|social|promo|banner|widget|related|meta|tag|author|breadcrumb)/i;

/**
 * Éléments dont le texte compte comme du contenu rédigé. En minuscules : les
 * sélecteurs de `node-html-parser` distinguent la casse des noms de balises,
 * là où `tagName` les rend en majuscules.
 */
const CONTENT_SELECTOR = "p,pre,td,li,blockquote,h2,h3,h4,h5,h6";

/** Sous ce nombre de caractères, un paragraphe est une légende ou un bouton. */
const MIN_CONTENT_TEXT_LENGTH = 25;

/**
 * Le convertisseur HTML → markdown.
 *
 * `globalEscape` reprend le comportement par défaut **sans les crochets** :
 * les actualités passent ensuite par `annotateErrataMarkdown`, qui lit
 * `[E]`, `[M]`, `[Predict 2]` ou `[Azir, Empereur]` pour en faire des icônes,
 * des badges de mot-clé et des liens de carte. Un `\[` échappé les rendrait
 * tous en texte brut — c'est-à-dire exactement ce que l'import cherche à
 * éviter.
 */
const markdownTranslator = new NodeHtmlMarkdown({
  bulletMarker: "-",
  globalEscape: [/[\\`*_~]/gm, "\\$&"],
  keepDataImages: false,
  maxConsecutiveNewlines: 2,
});

function metaContent(root: HTMLElement, attribute: "property" | "name", value: string): string | undefined {
  const el = root.querySelector(`meta[${attribute}="${value}"]`);
  const content = el?.getAttribute("content")?.trim();
  return content || undefined;
}

/** Résout une URL éventuellement relative contre la page d'origine. */
export function absoluteUrl(raw: string | undefined, pageUrl: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) return undefined;
  try {
    const resolved = new URL(trimmed, pageUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** La plus large des variantes d'un `srcset` — celle qui rend le mieux une fois réhébergée. */
function widestFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;

  let best: { url: string; width: number } | undefined;
  for (const candidate of srcset.split(",")) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    if (!url) continue;
    const width = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
    if (!best || width > best.width) best = { url, width: Number.isNaN(width) ? 0 : width };
  }

  return best?.url;
}

function textLength(el: HTMLElement): number {
  return el.structuredText.replace(/\s+/g, " ").trim().length;
}

/** Part du texte tenue par des liens : un bloc de navigation frôle 1. */
function linkDensity(el: HTMLElement): number {
  const total = textLength(el);
  if (total === 0) return 0;
  const linked = el.querySelectorAll("a").reduce((sum, a) => sum + textLength(a), 0);
  return Math.min(linked / total, 1);
}

function classWeight(el: HTMLElement): number {
  const signature = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""} ${el.getAttribute("data-testid") ?? ""}`;
  let weight = 0;
  if (POSITIVE_CLASS_PATTERN.test(signature)) weight += 25;
  if (NEGATIVE_CLASS_PATTERN.test(signature)) weight -= 25;
  if (el.tagName === "ARTICLE") weight += 40;
  if (el.tagName === "MAIN") weight += 20;
  return weight;
}

/** Retire de l'arbre tout ce qui n'appartient jamais au corps d'un article. */
function stripNoise(root: HTMLElement): void {
  for (const el of root.querySelectorAll(NOISE_TAGS.join(","))) {
    el.remove();
  }

  for (const role of ["navigation", "banner", "contentinfo", "search", "complementary"]) {
    for (const el of root.querySelectorAll(`[role="${role}"]`)) {
      el.remove();
    }
  }

  for (const el of root.querySelectorAll("[class],[id],[data-testid]")) {
    const signature = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""} ${el.getAttribute("data-testid") ?? ""}`;
    if (NOISE_CLASS_PATTERN.test(signature)) el.remove();
  }
}

/**
 * Rassemble le bloc retenu et ceux de ses frères qui portent, eux aussi, du
 * contenu rédigé.
 *
 * Un corps d'article n'est presque jamais d'un seul tenant : les rédacteurs
 * empilent un bloc de texte, un bloc d'image, un encadré, chacun dans son
 * `div`. Ne garder que le mieux noté couperait l'article à son premier bloc.
 */
function collectArticleHtml(
  chosen: HTMLElement,
  adjustedScore: (el: HTMLElement) => number,
  chosenScore: number
): string {
  const parent = chosen.parentNode as HTMLElement | null;
  if (!parent || parent.tagName === "BODY" || parent.tagName === "HTML") return chosen.outerHTML;

  // Le seuil reste bas : il ne s'agit pas de retrouver un second article, mais
  // de ne pas perdre les blocs annexes du même. Ce qui n'appartient pas à
  // l'article a déjà été écarté avant la notation, ou pénalisé par sa classe.
  const threshold = Math.max(2, chosenScore * 0.25);
  const parts: string[] = [];

  for (const node of parent.childNodes) {
    if (node === chosen) {
      parts.push(chosen.outerHTML);
      continue;
    }
    if (node.nodeType !== 1) continue;

    const sibling = node as HTMLElement;
    // Un bloc qui ne porte qu'une illustration ne marque aucun point — il n'a
    // pas de paragraphe — mais il appartient bien à l'article, et c'est
    // justement une des images qu'on est venu chercher.
    const isIllustration = sibling.tagName === "IMG" || sibling.querySelector("img") !== null;
    if (adjustedScore(sibling) >= threshold || isIllustration) parts.push(sibling.outerHTML);
  }

  return parts.join("\n");
}

/**
 * Choisit le bloc qui porte l'article, à la manière de Readability : chaque
 * paragraphe donne des points à son parent, à son grand-parent (moitié) et à
 * son arrière-grand-parent (tiers), puis le meilleur candidat l'emporte. Sans
 * cette remontée, le gagnant serait toujours `<body>`, qui contient tout.
 *
 * Rend le HTML de l'article, frères utiles compris.
 */
function pickArticleHtml(root: HTMLElement): string | undefined {
  const scores = new Map<HTMLElement, number>();

  const addScore = (el: HTMLElement | null | undefined, points: number) => {
    if (!el || el.nodeType !== 1) return;
    scores.set(el, (scores.get(el) ?? 0) + points);
  };

  for (const el of root.querySelectorAll(CONTENT_SELECTOR)) {
    const length = textLength(el);
    if (length < MIN_CONTENT_TEXT_LENGTH) continue;

    const commas = (el.structuredText.match(/[,，、]/g) ?? []).length;
    const base = 1 + commas + Math.min(Math.floor(length / 100), 3);

    const parent = el.parentNode as HTMLElement | null;
    const grandParent = (parent?.parentNode ?? null) as HTMLElement | null;
    const greatGrandParent = (grandParent?.parentNode ?? null) as HTMLElement | null;

    addScore(parent, base);
    addScore(grandParent, base / 2);
    addScore(greatGrandParent, base / 3);
  }

  if (scores.size === 0) return undefined;

  // Un bloc dont le texte est presque entièrement cliquable est une liste
  // d'articles liés, pas un article.
  const adjustedScore = (el: HTMLElement) =>
    (scores.get(el) ?? 0) * (1 - linkDensity(el)) + classWeight(el) / 10;

  let best: { el: HTMLElement; score: number } | undefined;
  for (const el of scores.keys()) {
    const score = adjustedScore(el);
    if (!best || score > best.score) best = { el, score };
  }

  if (!best) return undefined;

  // Le meilleur candidat est parfois un enfant d'un bloc encore mieux placé :
  // on remonte tant que le parent fait mieux.
  let chosen = best.el;
  let chosenScore = best.score;
  let parent = chosen.parentNode as HTMLElement | null;
  while (parent && parent.tagName !== "BODY" && parent.tagName !== "HTML") {
    const parentScore = adjustedScore(parent);
    if (parentScore <= chosenScore) break;
    chosen = parent;
    chosenScore = parentScore;
    parent = parent.parentNode as HTMLElement | null;
  }

  return collectArticleHtml(chosen, adjustedScore, chosenScore);
}

/**
 * Normalise les images du bloc retenu : `src` absolu, variantes paresseuses
 * (`data-src`, `srcset`, `<picture>`) ramenées sur l'attribut `src`, pixels de
 * suivi supprimés. Une image dont l'URL reste relative disparaîtrait à la
 * lecture, sur un autre domaine que celui d'origine.
 */
function normalizeImages(article: HTMLElement, pageUrl: string): void {
  for (const source of article.querySelectorAll("picture source")) {
    const url = widestFromSrcset(source.getAttribute("srcset"));
    const picture = source.parentNode as HTMLElement | null;
    const img = picture?.querySelector("img");
    if (url && img && !img.getAttribute("src")) img.setAttribute("src", url);
    source.remove();
  }

  for (const img of article.querySelectorAll("img")) {
    const candidate =
      img.getAttribute("src") ??
      img.getAttribute("data-src") ??
      img.getAttribute("data-lazy-src") ??
      widestFromSrcset(img.getAttribute("srcset") ?? img.getAttribute("data-srcset"));

    const resolved = absoluteUrl(candidate, pageUrl);

    const width = Number.parseInt(img.getAttribute("width") ?? "", 10);
    const height = Number.parseInt(img.getAttribute("height") ?? "", 10);
    const isTrackingPixel = (width > 0 && width <= 2) || (height > 0 && height <= 2);

    if (!resolved || isTrackingPixel) {
      img.remove();
      continue;
    }

    img.setAttribute("src", resolved);
    img.removeAttribute("srcset");
    img.removeAttribute("data-src");
    img.removeAttribute("data-srcset");
  }
}

/** Les liens gardés doivent renvoyer chez la source, pas vers un chemin de Joutes. */
function normalizeLinks(article: HTMLElement, pageUrl: string): void {
  for (const link of article.querySelectorAll("a")) {
    const resolved = absoluteUrl(link.getAttribute("href"), pageUrl);
    if (resolved) {
      link.setAttribute("href", resolved);
    } else {
      link.removeAttribute("href");
    }
  }
}

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  // Coupé sur un mot plutôt qu'au milieu d'un, avec une ellipse pour dire
  // que la phrase continue chez la source.
  const cut = normalized.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Le nom du site, tel qu'il se présente, pour l'attribution de la source. */
function readSourceName(root: HTMLElement, pageUrl: string): string {
  const declared = metaContent(root, "property", "og:site_name") ?? metaContent(root, "name", "application-name");
  if (declared) return truncate(declared, 120);

  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

/**
 * La langue de la page, si elle en déclare une que Joutes parle.
 *
 * Les étiquettes rencontrées sont régionales (`fr-fr`, `en-us`, `og:locale`
 * en `fr_FR`) : seule la sous-étiquette de langue nous intéresse, les quatre
 * langues de l'application n'ayant pas de variantes régionales.
 */
function readLang(root: HTMLElement): Locale | undefined {
  const declared =
    root.querySelector("html")?.getAttribute("lang") ??
    metaContent(root, "property", "og:locale") ??
    metaContent(root, "name", "language");

  const base = declared?.trim().toLowerCase().split(/[-_]/)[0];
  return base && (locales as readonly string[]).includes(base) ? (base as Locale) : undefined;
}

function readTitle(root: HTMLElement): string {
  const candidate =
    metaContent(root, "property", "og:title") ??
    metaContent(root, "name", "twitter:title") ??
    root.querySelector("h1")?.structuredText ??
    root.querySelector("title")?.structuredText ??
    "";
  return truncate(candidate, MAX_TITLE_LENGTH);
}

/**
 * Le markdown ramené à sa prose, pour servir de résumé de secours : les
 * images, les liens et les séparateurs n'ont rien à faire dans les quelques
 * lignes affichées sous le titre dans la liste des actualités.
 */
function toPlainProse(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "");
}

/** Le résumé que la page déclare elle-même, s'il y en a un. */
function readDeclaredSummary(root: HTMLElement): string | undefined {
  return (
    metaContent(root, "property", "og:description") ??
    metaContent(root, "name", "description") ??
    metaContent(root, "name", "twitter:description")
  );
}

/**
 * Nettoie le markdown produit : le convertisseur laisse volontiers des lignes
 * vides en trop là où la page empilait des `<div>` vides, et des images sans
 * texte alternatif collées à leur paragraphe.
 */
function tidyMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Tire de la page HTML un brouillon d'actualité : titre, résumé, bannière, nom
 * de la source, et le corps de l'article converti en markdown en gardant sa
 * mise en page (titres, listes, tableaux, citations, séparateurs) et ses
 * images.
 *
 * Rend `undefined` si aucun bloc de la page ne ressemble à un article — mieux
 * vaut le dire que rendre un brouillon fait du menu de navigation.
 */
export function extractArticle(html: string, pageUrl: string): ExtractedArticle | undefined {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: false, noscript: false, style: false, pre: true },
  });

  const title = readTitle(root);
  const bannerUrl = absoluteUrl(
    metaContent(root, "property", "og:image") ?? metaContent(root, "name", "twitter:image"),
    pageUrl
  );
  const sourceName = readSourceName(root, pageUrl);
  const declaredSummary = readDeclaredSummary(root);
  const lang = readLang(root);

  // Les métadonnées sont lues avant ce nettoyage : `<head>` les porte toutes,
  // et il part avec le reste de ce qui n'est pas du contenu.
  root.querySelector("head")?.remove();
  stripNoise(root);

  // Le titre est déjà porté par le champ « titre » : le laisser dans le corps
  // le ferait apparaître deux fois sur la page de l'actualité.
  for (const heading of root.querySelectorAll("h1")) {
    heading.remove();
  }

  // Normalisé avant le choix du bloc, et non après : une image gardée pour son
  // `data-src` doit déjà peser dans la notation, et les frères retenus avec le
  // meilleur candidat passent alors par le même traitement.
  normalizeImages(root, pageUrl);
  normalizeLinks(root, pageUrl);

  const articleHtml = pickArticleHtml(root);
  if (!articleHtml) return undefined;

  const markdown = tidyMarkdown(markdownTranslator.translate(articleHtml));
  if (!markdown) return undefined;

  return {
    title,
    // À défaut de résumé déclaré, le début de l'article en fait un
    // acceptable : le champ est obligatoire à la publication, et c'est lui
    // qu'on lit dans la liste des actualités.
    summary: truncate(declaredSummary ?? toPlainProse(markdown), MAX_SUMMARY_LENGTH),
    bannerUrl,
    sourceName,
    lang,
    markdown,
  };
}

/** Toutes les images citées par un markdown, dans l'ordre, sans doublon. */
export function collectMarkdownImageUrls(markdown: string): string[] {
  const urls = new Set<string>();
  const regex = /!\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const url = match[1].replace(/^<|>$/g, "");
    if (/^https?:\/\//i.test(url)) urls.add(url);
  }

  return [...urls];
}

/**
 * Remplace les URL d'images par celles qu'on en a faites (réhébergement).
 * Les images restées en échec gardent leur adresse d'origine plutôt que de
 * disparaître du brouillon.
 */
export function rewriteMarkdownImageUrls(markdown: string, replacements: Map<string, string>): string {
  if (replacements.size === 0) return markdown;

  return markdown.replace(/(!\[[^\]]*\]\(\s*)(<[^>]*>|[^\s)]+)/g, (whole, prefix: string, rawUrl: string) => {
    const url = rawUrl.replace(/^<|>$/g, "");
    const replacement = replacements.get(url);
    return replacement ? `${prefix}${replacement}` : whole;
  });
}
