import 'server-only';

import { DiscordAPIError, REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import type { DiscordDmMessage } from "@/lib/notifications/discord-message";

/**
 * Un message privé du bot à un joueur.
 *
 * Deux appels : ouvrir (ou retrouver) le salon privé avec le joueur, puis y
 * écrire. Discord refuse le second quand le joueur ne partage aucun serveur
 * avec le bot ou a fermé ses messages privés : c'est un refus durable, pas une
 * panne, et l'appelant le distingue pour couper le réglage plutôt que de
 * réessayer à chaque notification.
 */

/** Codes d'erreur Discord qui disent « ce joueur ne peut pas être joint ». */
const UNREACHABLE_CODES = new Set([
  50007, // Cannot send messages to this user
  10013, // Unknown User
]);

export type DiscordDmResult =
  | { ok: true }
  | { ok: false; reason: "unreachable" | "error"; detail?: string };

let rest: REST | null = null;

function client(): REST | null {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return null;
  rest ??= new REST({ version: "10" }).setToken(token);
  return rest;
}

/** Le bot est-il configuré pour écrire ? Sans jeton, rien ne part. */
export function isDiscordDmConfigured(): boolean {
  return Boolean(process.env.DISCORD_TOKEN);
}

export async function sendDiscordDm(discordUserId: string, message: DiscordDmMessage): Promise<DiscordDmResult> {
  const api = client();
  if (!api) return { ok: false, reason: "error", detail: "DISCORD_TOKEN absent" };

  try {
    const channel = (await api.post(Routes.userChannels(), {
      body: { recipient_id: discordUserId },
    })) as { id: string };

    await api.post(Routes.channelMessages(channel.id), { body: message });
    return { ok: true };
  } catch (error) {
    if (error instanceof DiscordAPIError && typeof error.code === "number" && UNREACHABLE_CODES.has(error.code)) {
      return { ok: false, reason: "unreachable", detail: error.message };
    }
    return { ok: false, reason: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}
