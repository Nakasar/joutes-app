import crypto from "node:crypto";

import type { WatchedVideo } from "@/lib/types/StreamLink";

/**
 * WebSub côté YouTube, la partie qui se teste sans réseau.
 *
 * YouTube n'a pas d'EventSub. Ce qu'il offre est un hub WebSub — l'ancien
 * PubSubHubbub — qui pousse un flux Atom à chaque publication d'une chaîne.
 * Trois conséquences, qui expliquent presque tout le reste du dossier :
 *
 * 1. **Le hub ne dit pas « direct »**, il dit « quelque chose a été publié ».
 *    C'est `videos.list` qui tranche, dans `lib/streams/youtube-api.ts`.
 * 2. **Rien n'est poussé à la fin d'un direct**, ni au démarrage réel d'un
 *    direct programmé — l'entrée Atom arrive à sa *création*. D'où la liste de
 *    vidéos surveillées et le cron qui les interroge.
 * 3. **Le bail expire** (cinq jours au plus chez Google). Le même cron le
 *    renouvelle ; sans lui, l'écoute s'éteint toute seule au bout d'une semaine.
 *
 * La signature du hub est facultative dans la spécification. Elle ne l'est pas
 * ici : sans elle, l'adresse du webhook suffirait à déclarer le direct de
 * n'importe qui sur les destinations d'autrui.
 */

export const YOUTUBE_HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";
export const HUB_SIGNATURE_HEADER = "x-hub-signature";

/** Le bail demandé au hub, en secondes. Cinq jours — le maximum que Google accorde. */
export const YOUTUBE_LEASE_SECONDS = 432000;

/**
 * Quand renouveler : à un jour de l'échéance.
 *
 * La marge tient à la fréquence du cron et à la possibilité qu'un renouvellement
 * échoue une fois ou deux. Renouveler tôt ne coûte rien — le hub remplace le
 * bail existant — alors que renouveler trop tard éteint l'écoute en silence.
 */
export const YOUTUBE_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

/** Le sujet du hub pour une chaîne : son flux Atom. */
export function youtubeTopicUrl(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

/** L'adresse publique d'une chaîne, à partir de son identifiant `UC…`. */
export function youtubeChannelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
}

/** L'adresse de lecture d'une vidéo — celle que la vitrine intègre. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * Vraie si le corps poussé porte bien la signature du hub.
 *
 * L'algorithme est annoncé dans l'en-tête (`sha1=…`) et non imposé : la
 * spécification en autorise quatre, et le hub de Google signe encore en SHA-1.
 * On accepte donc ce qu'il annonce, en refusant tout nom hors de cette liste
 * fermée — sans quoi un attaquant choisirait lui-même une fonction faible.
 */
export function verifyHubSignature({
  rawBody,
  signature,
  secret,
}: {
  rawBody: string;
  signature: string | null | undefined;
  secret: string | null | undefined;
}): boolean {
  if (!signature || !secret) {
    return false;
  }

  const separator = signature.indexOf("=");
  if (separator <= 0) {
    return false;
  }

  const algorithm = signature.slice(0, separator).toLowerCase();
  const digest = signature.slice(separator + 1);

  if (!["sha1", "sha256", "sha384", "sha512"].includes(algorithm)) {
    return false;
  }

  const expected = crypto.createHmac(algorithm, secret).update(rawBody, "utf8").digest("hex");

  if (digest.length !== expected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

/** Combien de vidéos une liaison garde sous surveillance. */
export const MAX_WATCHED_VIDEOS = 20;

/** Au-delà, une vidéo signalée qui n'est jamais passée en direct est oubliée. */
export const WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ajoute les vidéos signalées à la liste sous surveillance.
 *
 * Bornée des deux côtés — par l'âge et par le nombre — pour qu'une chaîne qui
 * publie beaucoup ne fasse pas grossir son document sans fin. Les plus récentes
 * gagnent : un direct est presque toujours la dernière chose publiée.
 */
export function mergeWatchedVideos(
  existing: WatchedVideo[],
  videoIds: string[],
  now: string,
): WatchedVideo[] {
  const cutoff = Date.parse(now) - WATCH_TTL_MS;
  const merged = new Map<string, WatchedVideo>();

  for (const videoId of videoIds) {
    merged.set(videoId, { videoId, seenAt: now });
  }

  for (const item of existing) {
    if (merged.has(item.videoId) || Date.parse(item.seenAt) < cutoff) {
      continue;
    }

    merged.set(item.videoId, item);
  }

  return [...merged.values()]
    .sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt))
    .slice(0, MAX_WATCHED_VIDEOS);
}

export type YouTubeFeedEntry = {
  videoId: string;
  channelId: string;
  title?: string;
  /** ISO 8601 — la publication de l'entrée, pas le début du direct. */
  publishedAt?: string;
};

function readTag(source: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(source);
  return match ? decodeEntities(match[1].trim()) : undefined;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Lit les entrées d'une notification Atom.
 *
 * Écrit à la main plutôt qu'avec un analyseur XML : le flux de YouTube est
 * connu, minuscule, et la seule chose qu'on en tire est un couple
 * d'identifiants. Une dépendance de plus sur ce chemin coûterait plus qu'elle
 * ne rapporte.
 *
 * Les suppressions (`at:deleted-entry`) ne portent pas de `yt:videoId` et
 * ressortent donc naturellement vides : une vidéo retirée n'a pas à éteindre un
 * direct, c'est `videos.list` qui le fera au tour suivant du cron.
 */
export function readYouTubeFeed(xml: string): YouTubeFeedEntry[] {
  const entries: YouTubeFeedEntry[] = [];

  for (const match of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const body = match[1];
    const videoId = readTag(body, "yt:videoId");
    const channelId = readTag(body, "yt:channelId");

    if (!videoId || !channelId) {
      continue;
    }

    entries.push({
      videoId,
      channelId,
      title: readTag(body, "title"),
      publishedAt: readTag(body, "published"),
    });
  }

  return entries;
}
