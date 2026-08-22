import { NextResponse } from "next/server";

import {
  listActiveStreamLinks,
  listLiveStreamLinks,
  mergeStreamLinkSubscription,
  setWatchedVideos,
} from "@/lib/db/stream-links";
import { announceLive, retractLive } from "@/lib/streams/announce";
import { twitchConfig, youtubeConfig } from "@/lib/streams/config";
import { syncSubscription } from "@/lib/streams/subscriptions";
import { deleteTwitchSubscription, getLiveTwitchStreams, listTwitchSubscriptions } from "@/lib/streams/twitch-api";
import { twitchChannelUrl, TWITCH_SUBSCRIPTION_TYPES } from "@/lib/streams/twitch-eventsub";
import { getYouTubeVideos } from "@/lib/streams/youtube-api";
import {
  mergeWatchedVideos,
  YOUTUBE_RENEW_BEFORE_MS,
  youtubeWatchUrl,
} from "@/lib/streams/youtube-websub";
import type { StreamLink } from "@/lib/types/StreamLink";

/**
 * Le filet sous les webhooks.
 *
 * Les deux plateformes annoncent bien les directs, mais aucune ne suffit seule :
 *
 * - **Twitch** révoque un abonnement dont l'adresse a échoué trop souvent, et
 *   une livraison peut se perdre pendant un déploiement. Un `stream.offline`
 *   manqué laisserait un direct affiché pour toujours. On relit donc l'état réel
 *   — un appel Helix par lot de cent chaînes — et on le fait converger dans les
 *   deux sens.
 * - **YouTube** ne pousse rien du tout au démarrage d'un direct programmé ni à
 *   sa fin, et son bail WebSub expire au bout de cinq jours. Ici, le cron n'est
 *   pas un filet mais le mécanisme principal : c'est lui qui allume les directs
 *   programmés, lui qui les éteint, et lui qui renouvelle le bail.
 *
 * D'où la fréquence : toutes les cinq minutes. C'est le délai maximal entre le
 * début d'un direct YouTube programmé et son apparition sur une vitrine, et il
 * ne coûte qu'une unité de quota par tour.
 *
 * Rien ici ne jette : chaque liaison est traitée à part, et l'échec de l'une
 * n'empêche pas les autres.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  // Contrôle de présence en plus de la comparaison : sans lui, un `CRON_SECRET`
  // non défini ferait comparer à la chaîne littérale « Bearer undefined », que
  // n'importe qui peut envoyer.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = {
    twitch: { scanned: 0, started: 0, stopped: 0, resubscribed: 0, orphansRemoved: 0 },
    youtube: { scanned: 0, started: 0, stopped: 0, renewed: 0 },
  };

  if (twitchConfig()) {
    await reconcileTwitch(report.twitch);
  }

  if (youtubeConfig()) {
    await reconcileYouTube(report.youtube);
  }

  return NextResponse.json({ ok: true, ...report });
}

async function reconcileTwitch(report: {
  scanned: number;
  started: number;
  stopped: number;
  resubscribed: number;
  orphansRemoved: number;
}) {
  const links = await listActiveStreamLinks("twitch");
  report.scanned = links.length;

  // 1. Réparer les écoutes, en partant de ce que Twitch dit lui-même plutôt que
  //    de ce que notre base croit. C'est aussi ce qui rattrape la course de la
  //    confirmation : un abonnement bien vivant mais resté « en attente » chez
  //    nous redevient « actif » ici.
  const subscriptions = await listTwitchSubscriptions();
  const enabled = new Map<string, Set<string>>();

  for (const subscription of subscriptions) {
    if (subscription.status !== "enabled" || !subscription.broadcasterUserId) {
      continue;
    }

    const types = enabled.get(subscription.broadcasterUserId) ?? new Set<string>();
    types.add(subscription.type);
    enabled.set(subscription.broadcasterUserId, types);
  }

  for (const link of links) {
    const types = enabled.get(link.channelId) ?? new Set<string>();
    const complete = TWITCH_SUBSCRIPTION_TYPES.every((type) => types.has(type));

    if (!complete) {
      // Manquant ou révoqué. Twitch rend 409 sur celui qui existe déjà, donc
      // seul l'absent est créé — on ne double jamais un abonnement vivant.
      await syncSubscription(link, true);
      report.resubscribed += 1;
      continue;
    }

    if (link.subscription.state !== "active") {
      await mergeStreamLinkSubscription(link.id, {
        state: "active",
        confirmedAt: new Date().toISOString(),
        lastError: undefined,
      });
    }
  }

  // 2. Faire converger l'affiché sur le réel.
  const live = await getLiveTwitchStreams(links.map((link) => link.channelId));

  for (const link of links) {
    const stream = live.get(link.channelId);

    if (stream && link.live?.platformStreamId !== stream.streamId) {
      const announced = await announceLive(link, {
        url: twitchChannelUrl(stream.userLogin),
        title: stream.title,
        startedAt: stream.startedAt,
        platformStreamId: stream.streamId,
      });

      if (announced) {
        report.started += 1;
      }
    }
  }

  // Les directs annoncés dont la chaîne ne diffuse plus — y compris ceux dont la
  // liaison n'a plus de destination, qui ne sont plus dans `links`.
  for (const link of await listLiveStreamLinks("twitch")) {
    if (!live.has(link.channelId)) {
      await retractLive(link);
      report.stopped += 1;
    }
  }

  // 3. Ménage : un abonnement dont la chaîne n'est plus liée nous réveille pour
  //    rien et occupe une place dans le plafond de l'application.
  const known = new Set(links.map((link) => link.channelId));

  for (const subscription of subscriptions) {
    if (subscription.broadcasterUserId && !known.has(subscription.broadcasterUserId)) {
      if (await deleteTwitchSubscription(subscription.id)) {
        report.orphansRemoved += 1;
      }
    }
  }
}

async function reconcileYouTube(report: { scanned: number; started: number; stopped: number; renewed: number }) {
  const links = await listActiveStreamLinks("youtube");
  report.scanned = links.length;

  for (const link of links) {
    if (await renewIfNeeded(link)) {
      report.renewed += 1;
    }
  }

  // Un seul appel `videos.list` pour tout le monde : une unité de quota par lot
  // de cinquante identifiants, quel que soit le nombre de chaînes liées.
  const watching = links.flatMap((link) => (link.watched ?? []).map((item) => item.videoId));
  const currentlyLive = (await listLiveStreamLinks("youtube"))
    .map((link) => link.live?.platformStreamId)
    .filter((id): id is string => Boolean(id));

  const videos = await getYouTubeVideos([...new Set([...watching, ...currentlyLive])]);

  for (const link of links) {
    const now = new Date().toISOString();
    const started = (link.watched ?? [])
      .map((item) => videos.get(item.videoId))
      .find((video) => video?.state === "live");

    if (started && link.live?.platformStreamId !== started.videoId) {
      const announced = await announceLive(link, {
        url: youtubeWatchUrl(started.videoId),
        title: started.title,
        startedAt: started.startedAt,
        platformStreamId: started.videoId,
      });

      if (announced) {
        report.started += 1;
      }
    }

    // On oublie ce qui n'est plus ni en direct ni programmé : la surveillance a
    // fait son travail, et une vidéo ordinaire n'a rien à faire dans la liste.
    const stillWorthWatching = (link.watched ?? []).filter((item) => {
      const video = videos.get(item.videoId);
      return !video || video.state !== "none";
    });

    if (stillWorthWatching.length !== (link.watched ?? []).length) {
      await setWatchedVideos(link.id, mergeWatchedVideos(stillWorthWatching, [], now));
    }
  }

  for (const link of await listLiveStreamLinks("youtube")) {
    const videoId = link.live?.platformStreamId;
    const video = videoId ? videos.get(videoId) : undefined;

    // Absente de la réponse — supprimée, privée — ou plus en direct : dans les
    // deux cas la vitrine ne doit plus l'afficher.
    if (!videoId || !video || video.state !== "live") {
      await retractLive(link);
      report.stopped += 1;
    }
  }
}

/**
 * Renouvelle le bail WebSub s'il approche de son terme, ou le rétablit s'il est
 * tombé.
 *
 * Renouveler tôt ne coûte rien — le hub remplace le bail existant — alors que
 * renouveler trop tard éteint l'écoute en silence.
 */
async function renewIfNeeded(link: StreamLink): Promise<boolean> {
  const { state, expiresAt } = link.subscription;

  if (state === "failed" || state === "idle") {
    await syncSubscription(link, true);
    return true;
  }

  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;

  // Un abonnement « en attente » sans échéance connue depuis longtemps n'a
  // jamais été confirmé : le hub n'a pas rappelé, on redemande.
  if (Number.isNaN(expiry)) {
    if (state === "pending" && Date.parse(link.updatedAt) < Date.now() - 60 * 60 * 1000) {
      await syncSubscription(link, true);
      return true;
    }

    return false;
  }

  if (expiry - Date.now() > YOUTUBE_RENEW_BEFORE_MS) {
    return false;
  }

  // `syncSubscription` repose la demande et replace la liaison en « en
  // attente » : le hub confirmera le nouveau bail sur le webhook, avec sa
  // nouvelle échéance.
  await syncSubscription(link, true);

  return true;
}
