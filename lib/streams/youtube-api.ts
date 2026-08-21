import "server-only";

import { youtubeCallbackUrl, youtubeConfig } from "@/lib/streams/config";
import { YOUTUBE_HUB_URL, YOUTUBE_LEASE_SECONDS, youtubeTopicUrl } from "@/lib/streams/youtube-websub";

/**
 * YouTube, en deux morceaux qui ne se ressemblent pas.
 *
 * **Le hub** ne coûte rien et ne sait rien : on s'y abonne, il pousse un flux
 * Atom à chaque publication. **L'API Data**, elle, sait tout mais compte : un
 * quota quotidien de dix mille unités par défaut. C'est pourquoi une seule de
 * ses requêtes est utilisée en régime permanent, `videos.list`, qui coûte une
 * unité et accepte cinquante identifiants à la fois. `channels.list` n'est
 * appelée qu'à la liaison, une fois par compte.
 *
 * `search.list`, qui répondrait directement « cette chaîne diffuse-t-elle ? »,
 * est délibérément absente : cent unités par appel, soit cent appels par jour
 * pour tout le site. Elle ne passe pas l'échelle, même à dix chaînes liées.
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
  const config = youtubeConfig();
  const videos = new Map<string, YouTubeVideo>();

  if (!config || videoIds.length === 0) {
    return videos;
  }

  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);

    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,liveStreamingDetails");
      url.searchParams.set("id", batch.join(","));
      url.searchParams.set("key", config.apiKey);

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
