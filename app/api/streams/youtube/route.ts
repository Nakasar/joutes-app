import { NextResponse } from "next/server";

import {
  getStreamLinkByChannel,
  mergeStreamLinkSubscription,
  setStreamLinkSubscription,
  setWatchedVideos,
} from "@/lib/db/stream-links";
import { announceLive } from "@/lib/streams/announce";
import { youtubeConfig } from "@/lib/streams/config";
import { getYouTubeVideos } from "@/lib/streams/youtube-api";
import {
  HUB_SIGNATURE_HEADER,
  mergeWatchedVideos,
  readYouTubeFeed,
  verifyHubSignature,
  youtubeWatchUrl,
} from "@/lib/streams/youtube-websub";

/**
 * La vérification du hub WebSub.
 *
 * Le hub rappelle cette adresse en `GET` pour confirmer qu'on a bien demandé
 * l'abonnement, et attend le `hub.challenge` nu en réponse. Répondre 200 à
 * n'importe quel sujet reviendrait à laisser un tiers nous abonner à ses propres
 * chaînes : on ne confirme donc que les sujets qui désignent une chaîne liée
 * chez nous.
 *
 * `unsubscribe` suit la règle inverse et l'assume : une chaîne qu'on ne connaît
 * plus est précisément celle dont on veut être désabonné, et refuser la
 * confirmation laisserait le hub nous pousser son flux pour toujours.
 */
export async function GET(req: Request) {
  if (!youtubeConfig()) {
    return NextResponse.json({ error: "YouTube non configuré" }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const topic = params.get("hub.topic");
  const challenge = params.get("hub.challenge");

  if (!challenge || !topic || (mode !== "subscribe" && mode !== "unsubscribe")) {
    return NextResponse.json({ error: "Requête de vérification incomplète" }, { status: 400 });
  }

  const channelId = channelIdFromTopic(topic);

  if (!channelId) {
    return NextResponse.json({ error: "Sujet inconnu" }, { status: 404 });
  }

  const link = await getStreamLinkByChannel("youtube", channelId);

  if (mode === "unsubscribe") {
    if (link && link.targets.length === 0) {
      await setStreamLinkSubscription(link.id, { state: "idle" });
    }

    return challengeResponse(challenge);
  }

  if (!link || link.targets.length === 0) {
    return NextResponse.json({ error: "Chaîne non liée" }, { status: 404 });
  }

  const leaseSeconds = Number.parseInt(params.get("hub.lease_seconds") ?? "", 10);

  // Par champ, et non en bloc : la demande d'abonnement qui a déclenché cette
  // vérification n'a peut-être pas encore fini de s'écrire, et le hub confirme
  // parfois avant même de nous avoir répondu.
  await mergeStreamLinkSubscription(link.id, {
    state: "active",
    confirmedAt: new Date().toISOString(),
    expiresAt: Number.isFinite(leaseSeconds)
      ? new Date(Date.now() + leaseSeconds * 1000).toISOString()
      : undefined,
    lastError: undefined,
  });

  return challengeResponse(challenge);
}

/**
 * Le flux poussé par le hub.
 *
 * Il annonce une publication, pas un direct : YouTube pousse la même entrée
 * Atom pour une vidéo ordinaire, pour un direct qui commence et pour un direct
 * simplement programmé. `videos.list` tranche — c'est la seule requête d'API
 * en régime permanent, une unité de quota par lot de cinquante.
 *
 * Ce qui n'est pas encore en direct est **gardé sous surveillance** plutôt que
 * jeté : un direct programmé apparaît ici à sa création et rien n'est repoussé
 * à son démarrage réel. C'est le cron qui reviendra le regarder, et lui aussi
 * qui l'éteindra — le hub ne pousse rien à la fin d'un direct.
 *
 * On répond 200 dès que la livraison est authentique : le hub retire un
 * abonnement dont l'adresse échoue trop souvent.
 */
export async function POST(req: Request) {
  const config = youtubeConfig();

  if (!config) {
    return NextResponse.json({ error: "YouTube non configuré" }, { status: 503 });
  }

  const rawBody = await req.text();

  if (!verifyHubSignature({ rawBody, signature: req.headers.get(HUB_SIGNATURE_HEADER), secret: config.webSubSecret })) {
    console.warn("Signature de livraison WebSub YouTube invalide");
    return NextResponse.json({ error: "Signature invalide" }, { status: 403 });
  }

  const entries = readYouTubeFeed(rawBody);

  if (entries.length === 0) {
    return NextResponse.json({ ok: true, ignored: "flux-sans-entree" });
  }

  const now = new Date().toISOString();
  const applied: string[] = [];

  // Un flux ne porte qu'une chaîne en pratique, mais rien ne le garantit : on
  // regroupe plutôt que de le supposer.
  const byChannel = new Map<string, typeof entries>();
  for (const entry of entries) {
    byChannel.set(entry.channelId, [...(byChannel.get(entry.channelId) ?? []), entry]);
  }

  for (const [channelId, channelEntries] of byChannel) {
    const link = await getStreamLinkByChannel("youtube", channelId);

    if (!link || link.targets.length === 0) {
      continue;
    }

    const watched = mergeWatchedVideos(
      link.watched ?? [],
      channelEntries.map((entry) => entry.videoId),
      now,
    );
    await setWatchedVideos(link.id, watched);

    const videos = await getYouTubeVideos(channelEntries.map((entry) => entry.videoId));
    const started = [...videos.values()].find((video) => video.state === "live");

    if (!started) {
      continue;
    }

    if (link.live?.platformStreamId === started.videoId) {
      continue;
    }

    const announced = await announceLive(link, {
      url: youtubeWatchUrl(started.videoId),
      title: started.title,
      startedAt: started.startedAt,
      platformStreamId: started.videoId,
    });

    if (announced) {
      applied.push(started.videoId);
    }
  }

  return NextResponse.json({ ok: true, applied });
}

function challengeResponse(challenge: string) {
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

function channelIdFromTopic(topic: string): string | null {
  try {
    return new URL(topic).searchParams.get("channel_id");
  } catch {
    return null;
  }
}
