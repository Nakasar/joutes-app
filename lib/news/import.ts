import "server-only";

import { put } from "@vercel/blob";
import { ObjectId } from "mongodb";
import { getAllCardNamesById } from "@/lib/db/cards";
import { createMarkdownCardMentionBracketer } from "@/lib/loop-markdown";
import {
  collectMarkdownImageUrls,
  extractArticle,
  rewriteMarkdownImageUrls,
} from "@/lib/news/article-extraction";
import { fetchSourceImage, fetchSourcePage, type FetchFailure } from "@/lib/news/fetch-source";

/**
 * Import d'une actualité publiée ailleurs : on va chercher la page, on en tire
 * le corps de l'article avec sa mise en page et ses images, on recopie ces
 * images chez nous, et on met entre crochets les noms de cartes du jeu
 * rattaché pour qu'ils deviennent des liens à la lecture.
 *
 * Le brouillon obtenu n'est **jamais publié directement** : il atterrit dans
 * le formulaire d'actualité, où il est relu, corrigé et complété avant
 * publication — comme l'import d'un quizz.
 */

/**
 * Au-delà, la page n'est plus un article mais une archive : le formulaire
 * deviendrait inutilisable et le rendu, interminable.
 */
const MAX_CONTENT_LENGTH = 200_000;

/** Assez pour une FAQ illustrée carte par carte, pas assez pour une galerie. */
const MAX_REHOSTED_IMAGES = 40;

/** Images recopiées de front : de quoi aller vite sans saturer la sortie réseau. */
const IMAGE_CONCURRENCY = 5;

/**
 * Temps laissé à la recopie des images. Passé ce délai, celles qui restent
 * gardent l'adresse de la source : un brouillon complet en retard vaut moins
 * qu'un brouillon rendu, que l'auteur peut déjà relire.
 */
const IMAGE_BUDGET_MS = 60_000;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export type NewsImportDraft = {
  title: string;
  summary: string;
  content: string;
  banner?: string;
  source: { name: string; url: string };
  /** Ce que la recopie des images a donné, pour le dire à l'auteur. */
  images: { rehosted: number; keptRemote: number };
  /** Vrai quand la source annonçait une bannière qu'on n'a pas su recopier. */
  bannerMissed: boolean;
  /** Faux quand aucun jeu n'était rattaché : il n'y avait pas de catalogue où chercher. */
  cardsDetected: boolean;
};

export type NewsImportFailure = FetchFailure | "no-article";

export type NewsImportResult = { draft: NewsImportDraft } | { failure: NewsImportFailure };

/** Le suffixe de fichier qui correspond au type renvoyé par la source. */
function extensionFor(contentType: string): string | undefined {
  return EXTENSION_BY_CONTENT_TYPE[contentType];
}

/**
 * Recopie une image de la source sur notre stockage. Rend `undefined` si elle
 * n'a pas pu être récupérée ou si son format n'est pas un de ceux qu'on
 * accepte ailleurs (mêmes types que le téléversement d'une bannière).
 */
async function rehostImage(sourceUrl: string): Promise<string | undefined> {
  const image = await fetchSourceImage(sourceUrl);
  if (!image) return undefined;

  const extension = extensionFor(image.contentType);
  if (!extension) return undefined;

  try {
    const blob = await put(
      `news/imported/${Date.now()}.${extension}`,
      new Blob([image.bytes as BlobPart], { type: image.contentType }),
      { access: "public", contentType: image.contentType, addRandomSuffix: true }
    );
    return blob.url;
  } catch (error) {
    console.error("Recopie d'une image importée impossible:", sourceUrl, error);
    return undefined;
  }
}

/**
 * Recopie les images citées par le markdown, par petits paquets et sous
 * budget de temps. Rend la correspondance ancienne adresse → nouvelle ; les
 * absentes sont restées chez la source.
 */
async function rehostImages(urls: string[]): Promise<Map<string, string>> {
  const replacements = new Map<string, string>();
  const deadline = Date.now() + IMAGE_BUDGET_MS;
  const queue = urls.slice(0, MAX_REHOSTED_IMAGES);

  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= queue.length || Date.now() > deadline) return;

      const sourceUrl = queue[index];
      const hosted = await rehostImage(sourceUrl);
      if (hosted) replacements.set(sourceUrl, hosted);
    }
  };

  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, queue.length) }, worker));

  return replacements;
}

/**
 * Construit le brouillon d'actualité correspondant à l'URL donnée.
 *
 * `gameId` désigne le catalogue interrogé pour la détection des noms de
 * cartes ; sans lui, le corps est importé tel quel et seuls les mots-clés de
 * règles restent mis en forme (ils sont reconnus à l'affichage, sans crochets).
 */
export async function importNewsFromUrl(
  rawUrl: string,
  options: { gameId?: string } = {}
): Promise<NewsImportResult> {
  const fetched = await fetchSourcePage(rawUrl);
  if ("failure" in fetched) return { failure: fetched.failure };

  const article = extractArticle(fetched.page.html, fetched.page.finalUrl);
  if (!article) return { failure: "no-article" };

  // La bannière passe par la même recopie que les images du corps : une
  // adresse extérieure ne figure pas dans `next.config.ts`, et `next/image`
  // refuserait de la rendre sur la page de l'actualité.
  const contentImageUrls = collectMarkdownImageUrls(article.markdown);
  const toRehost = article.bannerUrl
    ? [article.bannerUrl, ...contentImageUrls.filter((url) => url !== article.bannerUrl)]
    : contentImageUrls;

  const replacements = await rehostImages(toRehost);

  let content = rewriteMarkdownImageUrls(article.markdown, replacements);

  // Les noms de cartes sont mis entre crochets comme le fait la loupe :
  // `annotateErrataMarkdown` en fera des liens à l'affichage, exactement comme
  // pour une policy, un errata ou un quizz.
  let cardsDetected = false;
  if (options.gameId) {
    const cardNames = (await getAllCardNamesById(new ObjectId(options.gameId))).map((card) => card.name);
    if (cardNames.length > 0) {
      content = createMarkdownCardMentionBracketer(cardNames)(content);
      cardsDetected = true;
    }
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    content = `${content.slice(0, MAX_CONTENT_LENGTH)}\n\n…`;
  }

  const rehostedContentImages = contentImageUrls.filter((url) => replacements.has(url)).length;

  // Une bannière restée chez la source ne peut pas servir : la page de
  // l'actualité la rend avec `next/image`, qui n'accepte que les hôtes
  // déclarés dans `next.config.ts`. Mieux vaut un brouillon sans bannière,
  // que l'auteur téléverse lui-même, qu'une image qui ne s'affichera pas.
  const banner = article.bannerUrl ? replacements.get(article.bannerUrl) : undefined;

  return {
    draft: {
      title: article.title,
      summary: article.summary,
      content,
      banner,
      source: { name: article.sourceName, url: fetched.page.finalUrl },
      images: { rehosted: rehostedContentImages, keptRemote: contentImageUrls.length - rehostedContentImages },
      bannerMissed: !!article.bannerUrl && !banner,
      cardsDetected,
    },
  };
}
