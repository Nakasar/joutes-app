import crypto from "node:crypto";

/**
 * EventSub, la partie qui se teste sans réseau.
 *
 * Twitch signe chacune de ses livraisons en HMAC-SHA256 sur la concaténation de
 * trois choses — l'identifiant du message, son horodatage, puis le corps brut —
 * et pose l'empreinte préfixée de `sha256=` dans `Twitch-Eventsub-Message-Signature`.
 *
 * **Le corps signé est celui des octets reçus.** `await req.text()`, jamais
 * `req.json()` : un corps re-sérialisé donne une autre empreinte dès le premier
 * flottant ou le premier échappement inattendu. Le webhook Discord de ce dépôt
 * (`app/discord/route.ts`) fait l'erreur ; on ne la reproduit pas, et un test la
 * garde.
 *
 * L'horodatage est vérifié en plus de la signature. Une signature valide reste
 * valide pour toujours : sans fenêtre, une livraison capturée pourrait être
 * rejouée un an plus tard pour rallumer un direct éteint. Twitch recommande dix
 * minutes, c'est ce qu'on applique.
 */

export const TWITCH_MESSAGE_ID_HEADER = "twitch-eventsub-message-id";
export const TWITCH_MESSAGE_TIMESTAMP_HEADER = "twitch-eventsub-message-timestamp";
export const TWITCH_MESSAGE_SIGNATURE_HEADER = "twitch-eventsub-message-signature";
export const TWITCH_MESSAGE_TYPE_HEADER = "twitch-eventsub-message-type";
export const TWITCH_SUBSCRIPTION_TYPE_HEADER = "twitch-eventsub-subscription-type";

/** Les trois types de livraison qu'une adresse EventSub reçoit. */
export type TwitchMessageType = "webhook_callback_verification" | "notification" | "revocation";

/** Les deux abonnements qui nous intéressent : le début et la fin du direct. */
export const TWITCH_SUBSCRIPTION_TYPES = ["stream.online", "stream.offline"] as const;

export type TwitchSubscriptionType = (typeof TWITCH_SUBSCRIPTION_TYPES)[number];

/** La fenêtre de rejeu, en millisecondes. Dix minutes, comme Twitch le recommande. */
export const TWITCH_REPLAY_WINDOW_MS = 10 * 60 * 1000;

/**
 * L'empreinte attendue pour cette livraison.
 *
 * Isolée pour que le test la compare à une valeur calculée à la main, et pour
 * que le script de mise au point local (voir `docs/STREAM_LINKING.md`) signe ses
 * fixtures exactement comme Twitch le ferait.
 */
export function twitchSignature({
  messageId,
  timestamp,
  rawBody,
  secret,
}: {
  messageId: string;
  timestamp: string;
  rawBody: string;
  secret: string;
}): string {
  return `sha256=${crypto
    .createHmac("sha256", secret)
    .update(`${messageId}${timestamp}${rawBody}`, "utf8")
    .digest("hex")}`;
}

/**
 * Vraie si la livraison est authentique et récente.
 *
 * Ferme par défaut : un en-tête absent, un secret vide, un horodatage
 * illisible ou hors fenêtre rendent `false` plutôt que de laisser passer. La
 * comparaison ne se fait qu'entre deux tampons de même longueur —
 * `timingSafeEqual` **jette** sinon, et un en-tête malformé deviendrait une
 * erreur 500 au lieu d'un refus.
 */
export function verifyTwitchSignature({
  messageId,
  timestamp,
  rawBody,
  signature,
  secret,
  now = Date.now(),
}: {
  messageId: string | null | undefined;
  timestamp: string | null | undefined;
  rawBody: string;
  signature: string | null | undefined;
  secret: string | null | undefined;
  now?: number;
}): boolean {
  if (!messageId || !timestamp || !signature || !secret) {
    return false;
  }

  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt) || Math.abs(now - sentAt) > TWITCH_REPLAY_WINDOW_MS) {
    return false;
  }

  const expected = twitchSignature({ messageId, timestamp, rawBody, secret });

  if (signature.length !== expected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export type TwitchStreamOnlineEvent = {
  broadcasterUserId: string;
  broadcasterUserLogin: string;
  broadcasterUserName?: string;
  /** ISO 8601 donné par Twitch — préféré à notre propre horloge. */
  startedAt?: string;
  streamId?: string;
};

export type TwitchNotification =
  | { kind: "online"; event: TwitchStreamOnlineEvent }
  | { kind: "offline"; broadcasterUserId: string }
  | { kind: "unknown" };

/**
 * Lit la charge utile d'une notification.
 *
 * Tolérante à ce qu'elle ne connaît pas — un abonnement ajouté plus tard, un
 * champ renommé — et stricte sur ce dont elle a besoin : sans identifiant de
 * diffuseur, il n'y a personne à qui rattacher l'événement, et on rend
 * `unknown` plutôt qu'un événement à moitié rempli.
 */
export function readTwitchNotification(payload: unknown): TwitchNotification {
  if (!payload || typeof payload !== "object") {
    return { kind: "unknown" };
  }

  const body = payload as Record<string, unknown>;
  const subscription = body.subscription as Record<string, unknown> | undefined;
  const event = body.event as Record<string, unknown> | undefined;
  const type = typeof subscription?.type === "string" ? subscription.type : null;

  const broadcasterUserId = typeof event?.broadcaster_user_id === "string" ? event.broadcaster_user_id : null;
  if (!broadcasterUserId) {
    return { kind: "unknown" };
  }

  if (type === "stream.offline") {
    return { kind: "offline", broadcasterUserId };
  }

  if (type === "stream.online") {
    const login = typeof event?.broadcaster_user_login === "string" ? event.broadcaster_user_login : null;
    if (!login) {
      return { kind: "unknown" };
    }

    return {
      kind: "online",
      event: {
        broadcasterUserId,
        broadcasterUserLogin: login,
        broadcasterUserName: typeof event?.broadcaster_user_name === "string" ? event.broadcaster_user_name : undefined,
        startedAt: typeof event?.started_at === "string" ? event.started_at : undefined,
        streamId: typeof event?.id === "string" ? event.id : undefined,
      },
    };
  }

  return { kind: "unknown" };
}

/** Le défi que Twitch envoie une fois, à la création de l'abonnement. */
export function readTwitchChallenge(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const challenge = (payload as Record<string, unknown>).challenge;
  return typeof challenge === "string" && challenge.length > 0 ? challenge : null;
}

/** L'adresse publique d'une chaîne, à partir de son `login`. */
export function twitchChannelUrl(login: string): string {
  return `https://twitch.tv/${encodeURIComponent(login)}`;
}
