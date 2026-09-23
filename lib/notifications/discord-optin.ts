import 'server-only';

import { findDiscordAccountId, setDiscordDmEnabled } from "@/lib/db/discord-notifications";
import { isDiscordDmConfigured, sendDiscordDm } from "@/lib/discord/dm";
import { JOUTES_EMBED_COLOR, joutesBaseUrl } from "@/lib/notifications/discord-message";

/**
 * Activer ou couper les messages privés Discord d'un compte.
 *
 * Partagé par la page Notifications et la commande `/notifications` du bot,
 * pour qu'un seul chemin décide. L'activation **envoie un premier message** :
 * c'est la seule façon de savoir que le bot peut écrire à ce joueur (serveur en
 * commun, MP ouverts). Un réglage allumé qui n'enverrait jamais rien serait
 * pire qu'un refus expliqué.
 */

export type DiscordOptInResult =
  | { ok: true }
  | { ok: false; reason: "not-linked" | "unreachable" | "unavailable" };

export async function enableDiscordDm(userId: string): Promise<DiscordOptInResult> {
  if (!isDiscordDmConfigured()) return { ok: false, reason: "unavailable" };

  const discordId = await findDiscordAccountId(userId);
  if (!discordId) return { ok: false, reason: "not-linked" };

  const result = await sendDiscordDm(discordId, {
    embeds: [
      {
        title: "Notifications Joutes activées",
        description:
          "Vos notifications Joutes arriveront aussi ici, en plus des autres canaux activés. " +
          "Pour les couper : `/notifications désactiver`, ou vos réglages de notification.",
        url: `${joutesBaseUrl().replace(/\/+$/, "")}/account/notifications`,
        color: JOUTES_EMBED_COLOR,
        footer: { text: "Joutes" },
      },
    ],
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason === "unreachable" ? "unreachable" : "unavailable" };
  }

  await setDiscordDmEnabled(userId, true);
  return { ok: true };
}

export async function disableDiscordDm(userId: string): Promise<void> {
  await setDiscordDmEnabled(userId, false);
}

/** Le refus, dit au joueur. */
export function discordOptInErrorMessage(reason: Exclude<DiscordOptInResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "not-linked":
      return "Liez d'abord votre compte Discord à Joutes, depuis la page Sécurité de votre compte.";
    case "unreachable":
      return "Le bot Joutes ne peut pas vous écrire en message privé. Rejoignez un serveur où il est présent et autorisez les messages privés de ses membres, puis réessayez.";
    case "unavailable":
      return "Les messages Discord sont indisponibles pour le moment. Réessayez plus tard.";
  }
}
