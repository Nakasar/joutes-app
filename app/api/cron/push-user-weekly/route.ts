import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import db from "@/lib/mongodb";
import type { User } from "@/lib/types/User";
import { getEventsForUser } from "@/lib/db/events";
import { sendPushToUsers } from "@/lib/push/send";
import {
  WEEKLY_DIGEST_COOLDOWN_DAYS,
  weeklyDigestFilter,
  weeklyDigestPush,
} from "@/lib/notifications/weekly-digest";

/**
 * Le récapitulatif hebdomadaire, par notification push.
 *
 * Un cron distinct de `emails-user-weekly`, et non une passe de plus dans
 * celui-ci : le public est un autre filtre, la mémoire d'envoi un autre champ.
 * Les entremêler dans une seule requête donnerait une sélection illisible et un
 * anti-doublon fragile — recevoir le courriel priverait du push, ou l'inverse.
 *
 * Il ne passe surtout **pas** par `createNotification` : ce serait écrire des
 * milliers de documents dans l'inbox chaque lundi matin, pour un message qui
 * n'a pas vocation à y rester. Il appelle l'envoi directement.
 *
 * `node:http2`, dont dépend APNs, n'existe pas hors du runtime Node, que Cache
 * Components impose désormais à toute l'application.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = DateTime.utc();
  const endDate = today.plus({ weeks: 1 }).endOf("day");

  let sent = 0;
  let skipped = 0;

  try {
    const users = db
      .collection<User>("user")
      .find(weeklyDigestFilter("app", today.minus({ days: WEEKLY_DIGEST_COOLDOWN_DAYS }).toISO()!));

    while (await users.hasNext()) {
      const user = await users.next();
      if (!user) continue;

      const userId = user._id.toString();
      const events = await getEventsForUser(userId, "followed", undefined, undefined, undefined, undefined, {
        afterDate: today.toISO()!,
        beforeDate: endDate.toISO()!,
      });

      const digest = weeklyDigestPush(events);
      if (!digest) {
        // Rien à annoncer : on ne marque pas non plus l'envoi, pour que la
        // semaine suivante reparte d'une page blanche.
        skipped++;
        continue;
      }

      await sendPushToUsers([userId], {
        title: digest.title,
        body: digest.body,
        link: "/events",
        notificationId: `weekly:${today.toISODate()}`,
        // Un récapitulatif remplace le précédent : deux semaines empilées sur
        // l'écran de verrouillage ne servent personne.
        collapseId: "weekly-digest",
      });

      // Marqué APRÈS l'envoi. Dans l'autre ordre, un jeton d'accès refusé ou
      // une configuration invalide laisserait l'utilisateur noté « servi »
      // sans rien avoir reçu, et sans rattrapage avant la semaine suivante.
      // Le risque inverse — un envoi réussi non marqué — se solde par un
      // second récapitulatif dans sept jours, ce qui se remarque à peine.
      await db
        .collection("user")
        .updateOne({ _id: user._id }, { $set: { "notifications.app.weekly.lastSent": today.toISO() } });

      sent++;
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (error) {
    console.error("[push] récapitulatif hebdomadaire échoué", error);
    return NextResponse.json({ ok: false, error: "Envoi impossible" }, { status: 500 });
  }
}
