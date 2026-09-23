import type { Notification } from "@/lib/types/Notification";
import { notificationLink } from "./deeplink";

/**
 * Le message privé Discord d'une notification.
 *
 * Un embed plutôt qu'un texte brut : le titre devient cliquable vers la page
 * Joutes, et Discord l'affiche en carte, distincte d'une conversation. Le lien
 * est absolu — un MP n'a pas de site autour de lui pour résoudre un chemin
 * relatif — et retombe sur la liste des notifications quand la notification
 * n'a pas de destination.
 *
 * Les longueurs sont bornées aux limites de Discord (titre 256, description
 * 4096) : au-delà, l'API refuse le message entier.
 *
 * Module pur : c'est ce qui le rend testable.
 */

/** La couleur de la marque, en entier comme l'attend Discord. */
export const JOUTES_EMBED_COLOR = 0x0079b6;

const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 4096;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export type DiscordDmMessage = {
  embeds: {
    title: string;
    description?: string;
    url: string;
    color: number;
    timestamp?: string;
    footer: { text: string };
  }[];
};

export function discordNotificationMessage(
  notification: Pick<Notification, "title" | "description" | "createdAt" | "type" | "template" | "link"> & {
    leagueId?: string;
    lairId?: string;
    eventId?: string;
  },
  baseUrl: string
): DiscordDmMessage {
  const base = baseUrl.replace(/\/+$/, "");
  const path = notificationLink(notification) ?? "/notifications";

  return {
    embeds: [
      {
        title: truncate(notification.title || "Joutes", TITLE_LIMIT),
        ...(notification.description
          ? { description: truncate(notification.description, DESCRIPTION_LIMIT) }
          : {}),
        url: `${base}${path}`,
        color: JOUTES_EMBED_COLOR,
        ...(notification.createdAt ? { timestamp: notification.createdAt } : {}),
        footer: { text: "Joutes · /notifications désactiver pour ne plus les recevoir ici" },
      },
    ],
  };
}

/** L'adresse du site, pour les liens des messages privés. */
export function joutesBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.NEXT_PUBLIC_BASE_URL?.trim() || env.BETTER_AUTH_URL?.trim() || "https://joutes.app";
}
