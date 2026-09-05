/**
 * La réponse de `app.bsky.feed.getAuthorFeed`, ramenée à des publications.
 *
 * Pur, donc testé (`bluesky-feed.test.ts`) sur un corps réel capté chez
 * `public.api.bsky.app`. Même coupe que `readYouTubeFeed` / `getYouTubeVideos` :
 * le module réseau (`bluesky-api.ts`) rend le corps brut, celui-ci le met en
 * forme, et c'est celui-ci qu'on éprouve.
 *
 * ## Quatre choses sont écartées, et il faut savoir pourquoi
 *
 * 1. **Les reposts.** Aucune valeur de `filter` ne les retire — mesuré :
 *    `posts_no_replies` en rend sept sur vingt, et un nom de filtre inventé ne
 *    lève même pas d'erreur, l'API retombe en silence sur son défaut. Or un
 *    repost porte un `author` **différent** du compte sondé : l'afficher
 *    reviendrait à publier un tiers quelconque sous le nom de l'éditeur, sur
 *    une fiche que des mineurs lisent, sans pouvoir le modérer à la source.
 *    S'ajoutent deux ennuis mécaniques : son identifiant est celui de la
 *    publication d'origine (deux comptes qui repostent la même chose donnent le
 *    même document), et il faudrait le trier sur la date du repost et non sur
 *    celle de l'écrit, soit deux sémantiques de date dans une même collection.
 * 2. **Les réponses.** `filter=posts_no_replies` les retire aujourd'hui, mais
 *    cette sémantique a déjà changé une fois. On revérifie sur `record.reply` :
 *    deux lignes, et le jour où l'AppView change d'avis, un fil de six messages
 *    ne mange pas la grille.
 * 3. **Les publications étiquetées** par la modération de l'AppView. C'est le
 *    seul filtre de ce module qui protège d'autre chose que d'une gêne.
 * 4. **Ce qu'on ne sait pas dater.** Sans instant lisible, on ne sait pas
 *    ranger — et le tri est tout ce qui fait la grille.
 *
 * Les **citations** sont gardées (`app.bsky.embed.record#view`) : c'est bien
 * l'éditeur qui écrit, la citation est son propos. On ne rend pas la carte
 * citée, seulement son texte.
 */

import {
  blueskyExternalId,
  blueskyPostUrl,
  blueskyProfileUrl,
  readBlueskyPostUri,
} from "@/lib/social/bluesky-actors";
import { earliestInstant } from "@/lib/social/instants";
import type { CollectedSocialPost } from "@/lib/types/GameSocialPost";

/**
 * Les étiquettes qui écartent une publication.
 *
 * Liste **fermée**, et non « tout ce qui porte une étiquette » : l'AppView en
 * pose aussi d'anodines, et une liste ouverte finirait par tout écarter.
 * `!hide` et `!warn` sont les étiquettes système ; les autres décrivent un
 * contenu qui n'a rien à faire, publié automatiquement, sur la fiche d'un jeu.
 */
const BLOCKING_LABELS = new Set([
  "porn",
  "sexual",
  "nudity",
  "graphic-media",
  "gore",
  "!hide",
  "!warn",
  "!no-unauthenticated",
]);

/**
 * La longueur au-delà de laquelle le texte est coupé.
 *
 * On stocke un extrait, pas une archive : la vignette n'en montre que quelques
 * lignes, et le lien mène au texte entier chez la plateforme.
 */
export const MAX_SOCIAL_TEXT = 400;

export function truncateSocialText(value: string | undefined): string | undefined {
  const text = value?.trim();

  if (!text) {
    return undefined;
  }

  return text.length <= MAX_SOCIAL_TEXT ? text : `${text.slice(0, MAX_SOCIAL_TEXT - 1).trimEnd()}…`;
}

type Unknown = Record<string, unknown>;

function asObject(value: unknown): Unknown | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Unknown)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * La vignette, prise dans le premier embed qui en porte une.
 *
 * L'ordre n'est pas indifférent : une image publiée est le sujet du message, la
 * miniature d'une vidéo l'est aussi, tandis que l'aperçu d'un lien externe
 * n'appartient pas à l'éditeur. On prend donc du plus propre au moins propre.
 */
function readThumbnail(embed: Unknown | undefined): string | undefined {
  if (!embed) {
    return undefined;
  }

  const type = asString(embed["$type"]);

  if (type === "app.bsky.embed.images#view") {
    const images = Array.isArray(embed.images) ? embed.images : [];
    return asString(asObject(images[0])?.thumb);
  }

  if (type === "app.bsky.embed.video#view") {
    return asString(embed.thumbnail);
  }

  if (type === "app.bsky.embed.external#view") {
    return asString(asObject(embed.external)?.thumb);
  }

  // Une citation peut porter son propre média sous `media`, la forme
  // `recordWithMedia#view`. On la lit, sans descendre dans la carte citée.
  if (type === "app.bsky.embed.recordWithMedia#view") {
    return readThumbnail(asObject(embed.media));
  }

  return undefined;
}

function isLabelled(post: Unknown): boolean {
  const labels = Array.isArray(post.labels) ? post.labels : [];

  return labels.some((label) => {
    const value = asString(asObject(label)?.val);
    return value !== undefined && BLOCKING_LABELS.has(value);
  });
}

export type ReadBlueskyFeedOptions = {
  /**
   * Le compte attendu, en DID quand on le connaît.
   *
   * Une entrée d'un autre auteur est écartée. La garde double celle des
   * reposts, et couvre le cas où l'AppView rendrait autre chose que ce qu'on a
   * demandé — même précaution que le contrôle de `channelId` sur un flux Atom.
   */
  expectedDid?: string;
};

/**
 * Les publications d'un compte, telles que la base les rangera.
 *
 * Ne jette jamais : un corps hors forme rend une liste vide. Le sondage d'un
 * compte est une chose qui peut échouer, pas une chose qui doit tout arrêter.
 */
export function readBlueskyFeed(
  payload: unknown,
  options: ReadBlueskyFeedOptions = {},
): CollectedSocialPost[] {
  const body = asObject(payload);
  const feed = Array.isArray(body?.feed) ? body.feed : [];
  const collectedAt = new Date().toISOString();
  const posts: CollectedSocialPost[] = [];

  for (const rawEntry of feed) {
    const entry = asObject(rawEntry);
    if (!entry) continue;

    // Un repost : l'entrée porte `reason`, et son auteur n'est pas le nôtre.
    if (entry.reason !== undefined) continue;

    const post = asObject(entry.post);
    if (!post) continue;

    const record = asObject(post.record);
    if (!record) continue;

    // Une réponse dans un fil.
    if (record.reply !== undefined) continue;

    if (isLabelled(post)) continue;

    const ref = readBlueskyPostUri(asString(post.uri));
    if (!ref) continue;

    const author = asObject(post.author);
    const did = asString(author?.did);
    if (!did || did !== ref.did) continue;

    if (options.expectedDid && did !== options.expectedDid) continue;

    // `record.createdAt` est écrit par le client et n'est vérifié par personne ;
    // `indexedAt` est posé par le serveur. Voir `earliestInstant`.
    const publishedAt = earliestInstant(asString(record.createdAt), asString(post.indexedAt));
    if (!publishedAt) continue;

    const handle = asString(author?.handle);

    posts.push({
      platform: "bluesky",
      kind: "post",
      externalId: blueskyExternalId(ref.did, ref.rkey),
      url: blueskyPostUrl(ref.did, ref.rkey),
      account: {
        key: did,
        handle: handle ?? did,
        displayName: asString(author?.displayName),
        avatar: asString(author?.avatar),
        url: blueskyProfileUrl(did),
      },
      text: truncateSocialText(asString(record.text)),
      thumbnail: readThumbnail(asObject(post.embed)),
      publishedAt,
      collectedAt,
    });
  }

  return posts;
}
