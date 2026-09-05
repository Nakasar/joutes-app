/**
 * Les publications d'une chaîne YouTube, vidéos et shorts mêlés.
 *
 * Pur, donc testé. Il reçoit ce que les deux modules réseau ont déjà rapporté —
 * les entrées du flux Atom (`fetchYouTubeChannelFeed`, zéro unité de quota) et
 * l'état des vidéos (`getYouTubeVideos`, une unité par lot de cinquante) — et
 * n'en fait que la mise en forme.
 *
 * ## Short ou vidéo : la durée, et rien d'autre
 *
 * Le flux d'une chaîne mélange les deux sans le dire. Les distinguer se fait par
 * `contentDetails.duration`, demandé dans le **même** appel `videos.list` que
 * le reste : le quota est d'une unité par appel quel que soit le nombre de
 * `part`, donc cette information ne coûte ni unité ni aller-retour de plus.
 *
 * Les flux non documentés `playlist_id=UULF…` (vidéos) et `UUSH…` (shorts)
 * feraient le tri à la source, mais coûteraient deux requêtes de plus par
 * chaîne sur des identifiants que Google n'a jamais publiés et qui peuvent
 * disparaître sans préavis.
 *
 * **L'approximation est assumée** : la durée dit « format court », pas « ceci
 * est un Short ». Un Short est court *et* vertical ; une vidéo classique de
 * quatre-vingt-dix secondes sera donc classée `short`. La seule alternative
 * exacte serait une requête de plus par vidéo sur un comportement non
 * contractuel — trop cher pour une pastille.
 */

import { Duration } from "luxon";

import { truncateSocialText } from "@/lib/social/bluesky-feed";
import { normalizeInstant } from "@/lib/social/instants";
import type { CollectedSocialPost } from "@/lib/types/GameSocialPost";
import type { YouTubeVideo } from "@/lib/streams/youtube-api";
import type { YouTubeFeedEntry } from "@/lib/streams/youtube-websub";

/**
 * La borne du format court, en secondes.
 *
 * Trois minutes : la limite qu'applique YouTube depuis octobre 2024. Une valeur
 * qui bougera le jour où la plateforme la bougera.
 */
export const SHORT_MAX_SECONDS = 180;

/**
 * Une durée ISO 8601 (`PT3M1S`) en secondes, ou `undefined`.
 *
 * `Duration.fromISO` de luxon ne jette pas sur une valeur illisible, il rend un
 * objet `isValid === false` — d'où la garde, sans laquelle `as("seconds")`
 * rendrait `NaN` et une vidéo se retrouverait classée au hasard.
 */
export function readIsoDurationSeconds(value: string | undefined | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const duration = Duration.fromISO(value);

  return duration.isValid ? Math.round(duration.as("seconds")) : undefined;
}

/**
 * Ce format est-il court ?
 *
 * **Une durée inconnue vaut « vidéo », jamais « short »** : c'est le cas d'une
 * vidéo privée, supprimée, ou absente de la réponse. Se tromper vers la vidéo
 * est le sens qui ne surprend personne — une vignette de vidéo qui dure trente
 * secondes étonne moins qu'un « Short » de vingt minutes.
 */
export function isShortDuration(seconds: number | undefined): boolean {
  return seconds !== undefined && seconds > 0 && seconds <= SHORT_MAX_SECONDS;
}

/**
 * La miniature d'une vidéo, à URL stable et sans clé.
 *
 * `hqdefault` plutôt que `maxresdefault` : la première existe pour **toutes**
 * les vidéos, la seconde manque sur les plus anciennes et rend alors une image
 * grise. Même choix que `lib/media/live-embed.ts`.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/**
 * Une durée en secondes, telle qu'une vignette l'écrit : `2:45`, `1:02:03`.
 *
 * Partagée par la vignette de la fiche du jeu et par le fil de l'accueil.
 * L'écrire deux fois la ferait diverger au premier ajustement — et les deux
 * endroits montrent la même publication.
 *
 * Rend `undefined` pour ce qui n'a pas de durée : une publication Bluesky, une
 * vidéo dont YouTube n'a rien dit. L'appelant n'affiche alors pas de pastille.
 */
export function formatSocialDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }

  const heures = seconds >= 3600;

  return Duration.fromObject({ seconds })
    .shiftTo(...(heures ? (["hours", "minutes", "seconds"] as const) : (["minutes", "seconds"] as const)))
    .toFormat(heures ? "h:mm:ss" : "m:ss");
}

export type YouTubeSocialAccount = {
  /** L'identifiant `UC…` de la chaîne. */
  channelId: string;
  /** Le nom de la chaîne, et son handle quand elle en a un. */
  title?: string;
  handle?: string;
  url: string;
};

/**
 * Les publications d'une chaîne, à partir de son flux et de l'état des vidéos.
 *
 * Trois rejets :
 *
 * - **une entrée d'un autre `channelId`** — le flux d'une chaîne ne parle en
 *   principe que d'elle, mais une redirection rendrait celui d'une autre ;
 * - **une vidéo absente de la carte** — supprimée, privée, ou jamais publiée.
 *   Sans son état on ne sait ni sa durée ni si elle est diffusable ;
 * - **un direct en cours ou programmé** (`live`, `upcoming`). C'est le rejet le
 *   moins évident et le plus utile : le flux d'une chaîne contient ses directs,
 *   et sans ce tri un direct apparaîtrait dans la grille en doublon de
 *   `GameLiveSection`, juste au-dessus sur la même page. Le tour suivant le
 *   reprendra en `none`, avec sa vraie durée, une fois l'enregistrement clos.
 */
export function readYouTubeSocialPosts(
  entries: YouTubeFeedEntry[],
  videos: Map<string, YouTubeVideo>,
  account: YouTubeSocialAccount,
): CollectedSocialPost[] {
  const collectedAt = new Date().toISOString();
  const posts: CollectedSocialPost[] = [];

  for (const entry of entries) {
    if (entry.channelId !== account.channelId) continue;

    const video = videos.get(entry.videoId);
    if (!video || video.state !== "none") continue;

    const durationSeconds = readIsoDurationSeconds(video.duration);

    const publishedAt = normalizeInstant(entry.publishedAt);
    if (!publishedAt) continue;

    posts.push({
      platform: "youtube",
      kind: isShortDuration(durationSeconds) ? "short" : "video",
      externalId: entry.videoId,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(entry.videoId)}`,
      account: {
        key: account.channelId,
        handle: account.handle ?? account.title ?? account.channelId,
        displayName: account.title,
        url: account.url,
      },
      // Le titre d'une vidéo *est* son propos : c'est lui qu'on écrit sous la
      // vignette, là où Bluesky y met le corps du message.
      text: truncateSocialText(video.title ?? entry.title),
      thumbnail: youtubeThumbnailUrl(entry.videoId),
      publishedAt,
      durationSeconds,
      collectedAt,
    });
  }

  return posts;
}
