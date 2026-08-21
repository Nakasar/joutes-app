import { NextResponse } from "next/server";

import {
  getStreamLinkByChannel,
  mergeStreamLinkSubscription,
  setStreamLinkSubscription,
} from "@/lib/db/stream-links";
import { announceLive, retractLive } from "@/lib/streams/announce";
import { twitchConfig } from "@/lib/streams/config";
import { getLiveTwitchStreams } from "@/lib/streams/twitch-api";
import {
  readTwitchChallenge,
  readTwitchNotification,
  twitchChannelUrl,
  TWITCH_MESSAGE_ID_HEADER,
  TWITCH_MESSAGE_SIGNATURE_HEADER,
  TWITCH_MESSAGE_TIMESTAMP_HEADER,
  TWITCH_MESSAGE_TYPE_HEADER,
  verifyTwitchSignature,
} from "@/lib/streams/twitch-eventsub";

/**
 * Le webhook EventSub de Twitch.
 *
 * Trois choses le gouvernent, dans cet ordre.
 *
 * **Le corps est lu brut.** `await req.text()`, jamais `req.json()` : la
 * signature porte sur les octets reçus, précédés de l'identifiant du message et
 * de son horodatage. Le webhook Discord de ce dépôt vérifie un corps
 * re-sérialisé, ce qui ne marche que par chance ; un test de non-régression
 * tient la différence.
 *
 * **Le défi doit ressortir tel quel, en texte brut.** Twitch envoie une
 * vérification à la création de chaque abonnement et attend le `challenge` nu,
 * sans guillemets et sans JSON autour. Une réponse `application/json` échoue —
 * silencieusement, l'abonnement restant « en attente » pour toujours.
 *
 * **On répond 2xx dès que la livraison est authentique.** Twitch réémet sur
 * erreur et **révoque** l'abonnement après plusieurs échecs consécutifs :
 * répondre 500 parce qu'une chaîne n'est plus liée chez nous ferait perdre
 * l'écoute de tout le monde sur cette adresse. Seules la signature invalide
 * (403) et l'absence de configuration (503) sortent en erreur.
 *
 * La répétition d'une livraison est sans effet : un `stream.online` dont le
 * direct est déjà annoncé ressort ici, et la fenêtre de rejeu de dix minutes
 * empêche qu'une livraison capturée serve plus tard.
 */
export async function POST(req: Request) {
  const config = twitchConfig();

  if (!config) {
    // Aperçu, ou production pas encore configurée. On refuse franchement plutôt
    // que d'accepter sans vérifier.
    return NextResponse.json({ error: "Twitch non configuré" }, { status: 503 });
  }

  const rawBody = await req.text();

  const authentic = verifyTwitchSignature({
    messageId: req.headers.get(TWITCH_MESSAGE_ID_HEADER),
    timestamp: req.headers.get(TWITCH_MESSAGE_TIMESTAMP_HEADER),
    signature: req.headers.get(TWITCH_MESSAGE_SIGNATURE_HEADER),
    rawBody,
    secret: config.eventSubSecret,
  });

  if (!authentic) {
    console.warn("Signature de livraison Twitch EventSub invalide");
    return NextResponse.json({ error: "Signature invalide" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const messageType = req.headers.get(TWITCH_MESSAGE_TYPE_HEADER);

  if (messageType === "webhook_callback_verification") {
    const challenge = readTwitchChallenge(payload);

    if (!challenge) {
      return NextResponse.json({ error: "Défi absent" }, { status: 400 });
    }

    await confirmSubscription(payload);

    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (messageType === "revocation") {
    await noteRevocation(payload);
    return NextResponse.json({ ok: true });
  }

  if (messageType !== "notification") {
    return NextResponse.json({ ok: true, ignored: `type-${messageType ?? "inconnu"}` });
  }

  const notification = readTwitchNotification(payload);

  if (notification.kind === "unknown") {
    return NextResponse.json({ ok: true, ignored: "notification-non-reconnue" });
  }

  const broadcasterUserId =
    notification.kind === "online" ? notification.event.broadcasterUserId : notification.broadcasterUserId;

  const link = await getStreamLinkByChannel("twitch", broadcasterUserId);

  if (!link) {
    return NextResponse.json({ ok: true, ignored: "chaine-non-liee" });
  }

  if (notification.kind === "offline") {
    await retractLive(link);
    return NextResponse.json({ ok: true, applied: "offline" });
  }

  const { event } = notification;

  if (link.live?.platformStreamId && link.live.platformStreamId === event.streamId) {
    // Même direct, livraison répétée : rien à réécrire.
    return NextResponse.json({ ok: true, ignored: "direct-deja-annonce" });
  }

  // Le titre n'est pas dans la charge utile de `stream.online` ; on le demande,
  // et on s'en passe si Twitch ne répond pas — un direct sans titre s'affiche,
  // un direct manqué non.
  const streams = await getLiveTwitchStreams([event.broadcasterUserId]);
  const stream = streams.get(event.broadcasterUserId);

  const announced = await announceLive(link, {
    url: twitchChannelUrl(event.broadcasterUserLogin),
    title: stream?.title,
    startedAt: event.startedAt ?? stream?.startedAt,
    platformStreamId: event.streamId ?? stream?.streamId,
  });

  return NextResponse.json({ ok: true, applied: announced ? "online" : "aucune-destination" });
}

/** La vérification confirme l'abonnement : la liaison passe « active ». */
async function confirmSubscription(payload: unknown) {
  const link = await linkFromPayload(payload);

  if (!link || link.subscription.state === "active") {
    return;
  }

  // Par champ, et non en bloc : la demande d'abonnement qui a déclenché cette
  // vérification n'a peut-être pas encore rangé ses identifiants, et les écraser
  // rendrait la suppression impossible.
  await mergeStreamLinkSubscription(link.id, {
    state: "active",
    confirmedAt: new Date().toISOString(),
    lastError: undefined,
  });
}

/**
 * Twitch a coupé l'abonnement.
 *
 * Trois causes : notre adresse a échoué trop de fois, l'autorisation de
 * l'utilisateur a été retirée, ou l'abonnement a été supprimé. Dans les trois
 * cas la liaison passe en échec, et c'est le cron qui tentera de la rétablir —
 * ici, on n'a ni le temps ni le droit de réessayer, Twitch attend une réponse.
 */
async function noteRevocation(payload: unknown) {
  const link = await linkFromPayload(payload);

  if (!link) {
    return;
  }

  const status =
    typeof (payload as { subscription?: { status?: unknown } })?.subscription?.status === "string"
      ? (payload as { subscription: { status: string } }).subscription.status
      : "revoked";

  await setStreamLinkSubscription(link.id, { state: "failed", lastError: status });
}

async function linkFromPayload(payload: unknown) {
  const condition = (payload as { subscription?: { condition?: { broadcaster_user_id?: unknown } } })?.subscription
    ?.condition;

  if (typeof condition?.broadcaster_user_id !== "string") {
    return null;
  }

  return getStreamLinkByChannel("twitch", condition.broadcaster_user_id);
}
