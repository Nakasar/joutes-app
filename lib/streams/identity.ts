import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getStreamLink, upsertStreamLink } from "@/lib/db/stream-links";
import { getTwitchChannel } from "@/lib/streams/twitch-api";
import { getYouTubeChannelForToken } from "@/lib/streams/youtube-api";
import { twitchChannelUrl } from "@/lib/streams/twitch-eventsub";
import { youtubeChannelUrl } from "@/lib/streams/youtube-websub";
import type { StreamLink, StreamPlatform } from "@/lib/types/StreamLink";

/**
 * Du compte social lié à la chaîne qu'il désigne.
 *
 * Better Auth range un `accountId` et des jetons ; ni l'un ni l'autre n'est
 * l'adresse d'une chaîne. Ce module fait le pont, une fois par liaison :
 *
 * - **Twitch** — l'`accountId` *est* l'identifiant du diffuseur. Il manque le
 *   `login`, qui compose l'adresse publique ; Helix le donne.
 * - **YouTube** — l'`accountId` est un identifiant Google, sans rapport avec la
 *   chaîne. Seul `channels.list?mine=true`, avec le jeton de l'utilisateur,
 *   répond. Un compte Google sans chaîne existe : c'est un refus normal, pas une
 *   erreur.
 *
 * La résolution n'est refaite que lorsqu'elle manque. Un nom de chaîne change
 * rarement, et le cron de réconciliation rafraîchit les `login` Twitch au
 * passage.
 */

/** Le fournisseur Better Auth derrière chaque plateforme. */
export const STREAM_PROVIDER_IDS: Record<StreamPlatform, string> = {
  twitch: "twitch",
  // YouTube n'a pas d'OAuth à lui : une chaîne appartient à un compte Google, et
  // c'est ce compte que l'on lie. L'écran de compte parle de YouTube, jamais de
  // Google, parce que c'est la chaîne qui intéresse l'utilisateur.
  youtube: "google",
};

export type StreamIdentity = {
  channelId: string;
  channelLogin?: string;
  channelName?: string;
  channelUrl: string;
};

async function readTwitchIdentity(accountId: string): Promise<StreamIdentity | null> {
  const channel = await getTwitchChannel(accountId);

  if (!channel) {
    return null;
  }

  return {
    channelId: channel.id,
    channelLogin: channel.login,
    channelName: channel.displayName,
    channelUrl: twitchChannelUrl(channel.login),
  };
}

async function readYouTubeIdentity(userId: string): Promise<StreamIdentity | null> {
  let accessToken: string | undefined;

  try {
    const token = await auth.api.getAccessToken({
      body: { providerId: STREAM_PROVIDER_IDS.youtube, userId },
      headers: await headers(),
    });
    accessToken = token?.accessToken;
  } catch (error) {
    console.debug("Jeton Google indisponible pour la lecture de la chaîne YouTube:", error);
    return null;
  }

  if (!accessToken) {
    return null;
  }

  const channel = await getYouTubeChannelForToken(accessToken);

  if (!channel) {
    return null;
  }

  return {
    channelId: channel.id,
    channelLogin: channel.handle,
    channelName: channel.title,
    channelUrl: channel.handle?.startsWith("@")
      ? `https://www.youtube.com/${channel.handle}`
      : youtubeChannelUrl(channel.id),
  };
}

/**
 * La liaison de cette plateforme pour ce compte, créée au besoin.
 *
 * Rend `null` quand la chaîne ne peut pas être résolue — plateforme non
 * configurée, jeton expiré, compte Google sans chaîne. L'écran de compte
 * distingue alors « compte lié, chaîne introuvable » de « compte non lié », qui
 * ne se réparent pas de la même façon.
 */
export async function ensureStreamLink({
  userId,
  platform,
  accountId,
}: {
  userId: string;
  platform: StreamPlatform;
  accountId: string;
}): Promise<StreamLink | null> {
  const existing = await getStreamLink(userId, platform);

  if (existing?.channelUrl) {
    return existing;
  }

  const identity =
    platform === "twitch" ? await readTwitchIdentity(accountId) : await readYouTubeIdentity(userId);

  if (!identity) {
    return existing;
  }

  return upsertStreamLink({ userId, platform, ...identity });
}
