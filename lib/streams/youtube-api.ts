import "server-only";

import { youtubeApiKey, youtubeCallbackUrl, youtubeConfig } from "@/lib/streams/config";
import type { YouTubeChannelRef } from "@/lib/streams/youtube-channels";
import { youtubeFeedUrl } from "@/lib/streams/youtube-channels";
import type { YouTubeFeedEntry } from "@/lib/streams/youtube-websub";
import {
  readYouTubeFeed,
  YOUTUBE_HUB_URL,
  YOUTUBE_LEASE_SECONDS,
  youtubeTopicUrl,
} from "@/lib/streams/youtube-websub";

/**
 * YouTube, en deux morceaux qui ne se ressemblent pas.
 *
 * **Le hub** ne coûte rien et ne sait rien : on s'y abonne, il pousse un flux
 * Atom à chaque publication. **L'API Data**, elle, sait tout mais compte : un
 * quota quotidien de dix mille unités par défaut. C'est pourquoi une seule de
 * ses requêtes est utilisée en régime permanent, `videos.list`, qui coûte une
 * unité et accepte cinquante identifiants à la fois. `channels.list` n'est
 * appelée qu'une fois par chaîne — à la liaison d'un compte, ou à la première
 * lecture de l'adresse collée sur la fiche d'un jeu.
 *
 * `search.list`, qui répondrait directement « cette chaîne diffuse-t-elle ? »,
 * est délibérément absente : cent unités par appel, soit cent appels par jour
 * pour tout le site. Elle ne passe pas l'échelle, même à dix chaînes liées.
 * Pour les chaînes que personne ne nous a liées — celles des éditeurs — le flux
 * Atom public tient ce rôle, et ne coûte rien du tout.
 */

export type YouTubeChannel = {
  id: string;
  title: string;
  /** Le handle `@…` quand la chaîne en a un. */
  handle?: string;
  thumbnailUrl?: string;
};

/**
 * La chaîne du compte Google qui vient d'être lié.
 *
 * Passe par le jeton de l'utilisateur — c'est la seule requête qui le fasse, et
 * la seule qui exige le périmètre `youtube.readonly`. Un compte Google sans
 * chaîne YouTube rend `null` : c'est un cas normal, dont l'écran de compte doit
 * savoir parler.
 */
export async function getYouTubeChannelForToken(accessToken: string): Promise<YouTubeChannel | null> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error("Lecture de la chaîne YouTube refusée:", response.status, (await response.text()).slice(0, 200));
      return null;
    }

    const body = (await response.json()) as {
      items?: {
        id: string;
        snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
      }[];
    };

    const channel = body.items?.[0];

    if (!channel?.id) {
      return null;
    }

    return {
      id: channel.id,
      title: channel.snippet?.title ?? channel.id,
      handle: channel.snippet?.customUrl ?? undefined,
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
    };
  } catch (error) {
    console.error("Chaîne YouTube indisponible:", error);
    return null;
  }
}

/** Ce que YouTube dit d'une vidéo : programmée, en direct, ou ni l'un ni l'autre. */
export type VideoLiveState = "live" | "upcoming" | "none";

export type YouTubeVideo = {
  videoId: string;
  channelId: string;
  state: VideoLiveState;
  title?: string;
  /** ISO 8601 — le début réel du direct, que YouTube ne donne qu'une fois commencé. */
  startedAt?: string;
  /**
   * La durée, **telle que YouTube l'écrit** : une durée ISO 8601, `PT3M1S`.
   *
   * Elle vient de `contentDetails`, demandé dans le **même** appel : le quota de
   * `videos.list` est d'une unité par appel quel que soit le nombre de `part`,
   * si bien que cette information ne coûte ni unité ni aller-retour de plus.
   *
   * Rendue brute et non en secondes : ce module est un transport, et
   * l'interprétation appartient au module pur qui, lui, se teste
   * (`readIsoDurationSeconds` dans `lib/social/youtube-posts.ts`). C'est la même
   * coupe qu'entre `fetchYouTubeChannelFeed` et `readYouTubeFeed`.
   *
   * Absente pour une vidéo privée ou supprimée, et pour un direct en cours —
   * YouTube ne connaît la durée qu'une fois l'enregistrement clos.
   */
  duration?: string;
};

/**
 * L'état de chacune de ces vidéos.
 *
 * Une vidéo absente de la réponse — supprimée, privée, jamais publiée — est
 * absente de la carte rendue. L'appelant traite cette absence comme « plus en
 * direct », ce qui est le comportement voulu : une vidéo qu'on ne peut plus lire
 * n'a rien à faire sur une vitrine.
 */
export async function getYouTubeVideos(videoIds: string[]): Promise<Map<string, YouTubeVideo>> {
  // La clé seule : lire une vidéo publique ne pose aucun abonnement et n'a donc
  // que faire du secret WebSub qu'exige `youtubeConfig()`.
  const apiKey = youtubeApiKey();
  const videos = new Map<string, YouTubeVideo>();

  if (!apiKey || videoIds.length === 0) {
    return videos;
  }

  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);

    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      // `contentDetails` porte la durée, qui distingue un short d'une vidéo
      // (`lib/social/youtube-posts.ts`). Ajouté au `part` plutôt que demandé à
      // part : une unité par appel, quel que soit le nombre de `part`.
      url.searchParams.set("part", "snippet,liveStreamingDetails,contentDetails");
      url.searchParams.set("id", batch.join(","));
      url.searchParams.set("key", apiKey);

      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        console.error("Lecture de vidéos YouTube refusée:", response.status, (await response.text()).slice(0, 200));
        continue;
      }

      const body = (await response.json()) as {
        items?: {
          id: string;
          snippet?: { channelId?: string; title?: string; liveBroadcastContent?: string };
          liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
          contentDetails?: { duration?: string };
        }[];
      };

      for (const item of body.items ?? []) {
        const broadcast = item.snippet?.liveBroadcastContent;

        // `actualEndTime` tranche les cas où `liveBroadcastContent` traîne :
        // une fois la fin horodatée, le direct est terminé quoi qu'en dise le
        // reste de la réponse.
        const ended = Boolean(item.liveStreamingDetails?.actualEndTime);
        const state: VideoLiveState =
          !ended && broadcast === "live" ? "live" : !ended && broadcast === "upcoming" ? "upcoming" : "none";

        videos.set(item.id, {
          videoId: item.id,
          channelId: item.snippet?.channelId ?? "",
          state,
          title: item.snippet?.title,
          startedAt: item.liveStreamingDetails?.actualStartTime,
          duration: item.contentDetails?.duration,
        });
      }
    } catch (error) {
      console.error("Lecture de vidéos YouTube en échec:", error);
    }
  }

  return videos;
}

export type HubResult = { ok: true } | { ok: false; error: string };

/**
 * Pose — ou renouvelle, c'est la même requête — le bail du hub sur une chaîne.
 *
 * `hub.verify=async` : le hub confirme en rappelant notre webhook, ce qui rend
 * cet appel non bloquant. La liaison passe donc en « en attente » et n'est
 * « active » qu'à la réception du défi, dans `app/api/streams/youtube`.
 */
export async function subscribeToYouTubeChannel(channelId: string): Promise<HubResult> {
  return hubRequest(channelId, "subscribe");
}

export async function unsubscribeFromYouTubeChannel(channelId: string): Promise<HubResult> {
  return hubRequest(channelId, "unsubscribe");
}

async function hubRequest(channelId: string, mode: "subscribe" | "unsubscribe"): Promise<HubResult> {
  const config = youtubeConfig();
  const callback = youtubeCallbackUrl();

  if (!config) {
    return { ok: false, error: "youtube-non-configure" };
  }

  if (!callback) {
    return { ok: false, error: "adresse-de-rappel-absente" };
  }

  try {
    const response = await fetch(YOUTUBE_HUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "hub.mode": mode,
        "hub.topic": youtubeTopicUrl(channelId),
        "hub.callback": callback,
        "hub.verify": "async",
        "hub.secret": config.webSubSecret,
        "hub.lease_seconds": String(YOUTUBE_LEASE_SECONDS),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: `hub-${response.status}: ${(await response.text()).slice(0, 200)}` };
    }

    return { ok: true };
  } catch (error) {
    console.error(`Requête ${mode} au hub YouTube en échec:`, error);
    return { ok: false, error: "hub-injoignable" };
  }
}

/**
 * La chaîne désignée par une adresse publique, sans passer par un compte lié.
 *
 * C'est le pendant de `getYouTubeChannelForToken` pour les chaînes d'éditeurs :
 * personne n'a d'OAuth ici, l'administration a seulement collé une adresse sur
 * la fiche du jeu. Une unité de quota, payée **une fois** — le résultat est
 * rangé sur le document et n'est redemandé que si l'adresse change.
 *
 * Une référence de type `id` n'a rien à résoudre ; l'appel n'est fait que pour
 * en connaître le titre, et son échec n'empêche donc pas de suivre la chaîne.
 */
export async function resolveYouTubeChannel(ref: YouTubeChannelRef): Promise<YouTubeChannel | null> {
  // La clé seule, même raison que `getYouTubeVideos` : c'est une lecture.
  const apiKey = youtubeApiKey();

  if (!apiKey) {
    return null;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("key", apiKey);
  url.searchParams.set(
    ref.kind === "id" ? "id" : ref.kind === "handle" ? "forHandle" : "forUsername",
    ref.value,
  );

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      console.error("Résolution de chaîne YouTube refusée:", response.status, (await response.text()).slice(0, 200));
      return ref.kind === "id" ? { id: ref.value, title: ref.value } : null;
    }

    const body = (await response.json()) as {
      items?: { id: string; snippet?: { title?: string; customUrl?: string } }[];
    };

    const channel = body.items?.[0];

    if (!channel?.id) {
      // Un handle qui ne désigne rien : l'adresse de la fiche est fausse, ou la
      // chaîne a disparu. Sauf pour `id`, où l'adresse porte déjà la réponse.
      return ref.kind === "id" ? { id: ref.value, title: ref.value } : null;
    }

    return {
      id: channel.id,
      title: channel.snippet?.title ?? channel.id,
      handle: channel.snippet?.customUrl ?? undefined,
    };
  } catch (error) {
    console.error("Résolution de chaîne YouTube en échec:", error);
    return ref.kind === "id" ? { id: ref.value, title: ref.value } : null;
  }
}

/**
 * Les dernières publications d'une chaîne, lues dans son flux Atom public.
 *
 * **Aucune unité de quota** : c'est tout l'intérêt, et c'est ce qui rend un
 * sondage horaire tenable là où `search.list` coûterait cent unités par appel.
 * Le flux ne dit pas « direct » — c'est `getYouTubeVideos` qui tranche, une
 * unité par lot de cinquante identifiants.
 *
 * Le même document que le sujet WebSub des chaînes liées, et lu par le même
 * analyseur : un éditeur ne nous a rien signé, on va donc le chercher nous-
 * mêmes au lieu d'attendre qu'un hub le pousse.
 */
export async function fetchYouTubeChannelFeed(channelId: string): Promise<YouTubeFeedEntry[]> {
  try {
    const response = await fetch(youtubeFeedUrl(channelId), { cache: "no-store" });

    if (!response.ok) {
      console.error("Flux YouTube refusé:", channelId, response.status);
      return [];
    }

    return readYouTubeFeed(await response.text());
  } catch (error) {
    console.error("Flux YouTube injoignable:", channelId, error);
    return [];
  }
}
