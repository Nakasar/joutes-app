import 'server-only';

import { DateTime } from "luxon";
import { findDiscordAccountId } from "@/lib/db/discord-notifications";
import { listDuePosterDigests, markPosterDigestSent } from "@/lib/db/poster-digest";
import { isDiscordDmConfigured, sendDiscordDm } from "@/lib/discord/dm";
import { renderPosterImage } from "@/lib/posters/image";
import { resolveAccountPoster } from "@/lib/posters/library";
import { POSTER_BOT_LOCALE, posterStrings, posterVenueStrings } from "@/lib/posters/strings";
import { digestWeekKey, escapeDiscordMarkdown, MAX_DIGEST_POSTERS } from "@/lib/posters/digest";
import { plansForUserId } from "@/lib/subscriptions/access";
import { grantsEntitlement } from "@/lib/subscriptions/entitlements";
import { JOUTES_EMBED_COLOR, joutesBaseUrl } from "@/lib/notifications/discord-message";

/**
 * L'envoi du lundi : les affiches choisies, dessinées pour la semaine qui
 * commence, en pièces jointes d'un seul message privé.
 *
 * Même rendu que `/affiche` (`renderPosterImage`, mêmes contrôles de
 * visibilité par `resolveAccountPoster`) : une affiche n'ouvre jamais que ce
 * que le site ouvrirait déjà à ce compte.
 */

/**
 * Abonnés traités par passage du cron : un rendu d'affiche n'est pas gratuit.
 * Le cron passe chaque heure du lundi de 6 h à 23 h **UTC** (`0 6-23 * * 1`,
 * soit 7 h – 0 h à Paris en hiver, 8 h – 1 h en été) : dix-huit tranches,
 * soit 360 abonnés servis le lundi.
 */
export const DIGEST_BATCH_SIZE = 20;

export type DigestOutcome = "sent" | "not-entitled" | "not-linked" | "nothing-to-send" | "failed";

function fileName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `affiche-${slug || "joutes"}.png`;
}

export async function sendPosterDigest(userId: string, refs: string[], now: DateTime): Promise<DigestOutcome> {
  // Le droit se relit à chaque envoi : un abonnement arrêté coupe l'envoi sans
  // effacer le choix, qui reprendra si l'abonnement revient.
  if (!grantsEntitlement(await plansForUserId(userId), "sub:poster-digest")) return "not-entitled";

  const discordId = await findDiscordAccountId(userId);
  if (!discordId) return "not-linked";

  const t = posterStrings();
  const venueStrings = posterVenueStrings(t);
  const files: { name: string; data: Buffer; contentType: string }[] = [];
  const lines: string[] = [];

  for (const ref of refs.slice(0, MAX_DIGEST_POSTERS)) {
    const resolved = await resolveAccountPoster(userId, ref, venueStrings, now);
    if (resolved === "unknown" || resolved === "empty") continue;

    try {
      const image = await renderPosterImage({
        subject: resolved.subject,
        events: resolved.events,
        games: resolved.games,
        range: resolved.range,
        options: resolved.options,
        locale: POSTER_BOT_LOCALE,
        t,
      });
      files.push({ name: fileName(resolved.name), data: Buffer.from(image), contentType: "image/png" });
      // Le nom est saisi par l'utilisateur : échappé, il ne peut ni casser le
      // lien ni en glisser un autre dans le message.
      lines.push(`• [${escapeDiscordMarkdown(resolved.name)}](<${resolved.url}>)`);
    } catch (error) {
      console.error(`[affiches] rendu de ${ref} pour ${userId} échoué`, error);
    }
  }

  if (files.length === 0) return "nothing-to-send";

  const result = await sendDiscordDm(
    discordId,
    {
      embeds: [
        {
          title: "Vos affiches de la semaine",
          description: `${lines.join("\n")}\n\nPour changer d'affiches ou arrêter cet envoi : vos réglages de notification.`,
          url: `${joutesBaseUrl().replace(/\/+$/, "")}/account/notifications`,
          color: JOUTES_EMBED_COLOR,
          footer: { text: "Joutes Expert · chaque lundi" },
        },
      ],
    },
    files
  );

  if (!result.ok) {
    console.error(`[affiches] MP à ${userId} refusé (${result.reason})`, result.detail);
    return "failed";
  }
  return "sent";
}

/**
 * Un passage du cron : une tranche d'abonnés dont la semaine reste à envoyer.
 * Chaque abonné est marqué traité quoi qu'il arrive — un échec se retente la
 * semaine suivante, pas toutes les heures.
 */
export async function runPosterDigestBatch(now: DateTime = DateTime.now()): Promise<Record<DigestOutcome, number>> {
  const report: Record<DigestOutcome, number> = {
    sent: 0,
    "not-entitled": 0,
    "not-linked": 0,
    "nothing-to-send": 0,
    failed: 0,
  };
  if (!isDiscordDmConfigured()) return report;

  const weekKey = digestWeekKey(now);
  for (const subscriber of await listDuePosterDigests(weekKey, DIGEST_BATCH_SIZE)) {
    let outcome: DigestOutcome;
    try {
      outcome = await sendPosterDigest(subscriber.userId, subscriber.refs, now);
    } catch (error) {
      console.error(`[affiches] envoi à ${subscriber.userId} échoué`, error);
      outcome = "failed";
    }
    report[outcome]++;
    await markPosterDigestSent(subscriber.userId, weekKey);
  }
  return report;
}
