import 'server-only';

import { after } from "next/server";
import type { Notification, NotificationTarget } from "@/lib/types/Notification";
import { describeAudience } from "@/lib/notifications/audience";
import { loadAudienceUserIds } from "@/lib/db/notifications-audience";
import { listDiscordRecipients, setDiscordDmEnabled } from "@/lib/db/discord-notifications";
import { isDiscordDmConfigured, sendDiscordDm } from "@/lib/discord/dm";
import { discordNotificationMessage, joutesBaseUrl } from "@/lib/notifications/discord-message";

/**
 * D'une notification à des messages privés Discord.
 *
 * Même contrat que le push (`lib/push/dispatch.ts`) : planifié après la
 * réponse HTTP, jamais attendu, incapable de lever. Un canal de plus ne doit
 * pas pouvoir faire échouer ce qui a créé la notification.
 *
 * Le canal est **opt-in** : seuls les destinataires qui l'ont demandé et dont
 * le compte Discord est lié reçoivent un message. Ils sont peu nombreux par
 * construction, d'où un envoi direct, sans file ; le plafond protège une
 * invocation d'une annonce de lair très suivie, les limites de débit de
 * Discord étant tenues par `@discordjs/rest`, qui attend plutôt que d'échouer.
 */

/** Au-delà, les destinataires suivants ne reçoivent pas de MP pour cette notification. */
export const DISCORD_DM_FANOUT_LIMIT = 100;

function targetOf(notification: Notification): NotificationTarget {
  return notification as unknown as NotificationTarget;
}

export async function runDiscordFanout(notification: Notification): Promise<{ sent: number; disabled: number }> {
  const userIds = await loadAudienceUserIds(describeAudience(targetOf(notification)));
  if (userIds.length === 0) return { sent: 0, disabled: 0 };

  const recipients = await listDiscordRecipients(userIds);
  if (recipients.length === 0) return { sent: 0, disabled: 0 };

  if (recipients.length > DISCORD_DM_FANOUT_LIMIT) {
    console.warn(
      `[discord] ${recipients.length} destinataires pour ${notification.id} : seuls les ${DISCORD_DM_FANOUT_LIMIT} premiers reçoivent un MP`
    );
  }

  const message = discordNotificationMessage(notification, joutesBaseUrl());
  let sent = 0;
  let disabled = 0;

  for (const recipient of recipients.slice(0, DISCORD_DM_FANOUT_LIMIT)) {
    const result = await sendDiscordDm(recipient.discordId, message);
    if (result.ok) {
      sent++;
    } else if (result.reason === "unreachable") {
      // Plus de serveur en commun avec le bot, ou MP fermés : réessayer à
      // chaque notification ne ferait qu'user la limite de débit. Le réglage
      // est coupé ; la page Notifications le montre éteint, et il se rallume
      // d'un geste une fois les MP rouverts.
      await setDiscordDmEnabled(recipient.userId, false);
      disabled++;
    } else {
      console.error("[discord] MP échoué", notification.id, recipient.userId, result.detail);
    }
  }

  return { sent, disabled };
}

/**
 * Planifie les MP. **Synchrone, sans retour, et ne lève jamais.**
 *
 * Hors d'un contexte de requête (script, test), `after()` lève : l'envoi part
 * alors sans attendre, toujours sans pouvoir remonter d'erreur.
 */
export function scheduleDiscordFanout(notification: Notification): void {
  if (!isDiscordDmConfigured()) return;

  const run = async () => {
    try {
      await runDiscordFanout(notification);
    } catch (error) {
      console.error("[discord] fan-out échoué", notification.id, error);
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
