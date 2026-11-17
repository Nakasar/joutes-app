import { NextResponse } from 'next/server';
import {ObjectId} from "mongodb";
import db from "@/lib/mongodb";
import {Resend} from "resend";
import {User} from "@/lib/types/User";
import {DateTime} from "luxon";
import UserWeeklyEmail from "@/app/api/cron/emails-user-weekly/user-weekly-email";
import {WEEKLY_DIGEST_COOLDOWN_DAYS, weeklyDigestFilter} from "@/lib/notifications/weekly-digest";
import {isWeeklyEmailEmpty, readWeeklyEmailSettings, weeklyEmailSubject} from "@/lib/notifications/weekly-email";
import {loadWeeklyEmailContent} from "@/lib/notifications/weekly-email-service";
import {isCronAuthorized} from "@/lib/api/cron";

const resend = new Resend(process.env.RESEND_API_KEY);

// Chaque joueur coûte une vingtaine de lectures : on en traite plusieurs à la
// fois, dans la limite de temps des autres tâches planifiées.
export const maxDuration = 300;
const CONCURRENCY = 5;

type WeeklyUser = User & { _id: ObjectId };
type Outcome = "sent" | "skipped" | "failed";

async function processUser(user: WeeklyUser, today: DateTime): Promise<Outcome> {
  if (!user.email || !user.displayName) return "skipped";

  const settings = readWeeklyEmailSettings(user.notifications?.emails?.weekly);
  const content = await loadWeeklyEmailContent(
    {
      id: user._id.toString(),
      displayName: user.displayName,
      lairs: user.lairs ?? [],
      games: user.games ?? [],
      friends: user.friends ?? [],
      lairNotificationPrefs: user.lairNotificationPrefs,
      location: user.location,
      notifications: user.notifications,
    },
    settings.sections,
    today,
  );

  const markSent = () =>
    db.collection("user").updateOne(
      { _id: user._id },
      { $set: { "notifications.emails.weekly.lastSent": today.toISO() } },
    );

  // Une semaine sans rien à dire n'envoie rien, sauf à qui l'a demandé ;
  // l'invitation à suivre des lieux, elle, part toujours. La semaine est
  // tout de même passée : les annonces se comptent depuis ce point.
  if (settings.skipEmpty && isWeeklyEmailEmpty(content) && !content.followsNothing) {
    await markSent();
    return "skipped";
  }

  const subject = weeklyEmailSubject(content, today.toISO()!);
  // resend ne lève pas d'erreur : un refus revient dans `error`. La date
  // d'envoi n'avance qu'une fois l'email parti, sans quoi ses annonces et ses
  // résultats seraient perdus.
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "onboarding@resend.dev",
    to: user.email,
    subject,
    react: <UserWeeklyEmail content={content} subject={subject} />,
  });
  if (error) {
    console.error(`Email hebdomadaire refusé pour ${user._id.toString()} :`, error);
    return "failed";
  }

  await markSent();
  return "sent";
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const today = DateTime.utc();
  const counts: Record<Outcome, number> = { sent: 0, skipped: 0, failed: 0 };

  try {
    // Le filtre est partagé avec le récapitulatif push
    // (`lib/notifications/weekly-digest.ts`) : chaque canal garde sa propre
    // mémoire d'envoi, mais la règle d'éligibilité est écrite une fois. L'ordre
    // stable fait qu'une exécution coupée reprend, à la suivante, avec ceux
    // qui n'ont rien reçu.
    const users = db
      .collection<WeeklyUser>("user")
      .find(weeklyDigestFilter("emails", today.minus({ days: WEEKLY_DIGEST_COOLDOWN_DAYS }).toISO()!))
      .sort({ _id: 1 });

    let batch: WeeklyUser[] = [];
    const flush = async () => {
      const outcomes = await Promise.all(
        batch.map((user) =>
          processUser(user, today).catch((error) => {
            console.error(`Email hebdomadaire non envoyé à ${user._id.toString()} :`, error);
            return "failed" as const;
          }),
        ),
      );
      for (const outcome of outcomes) counts[outcome] += 1;
      batch = [];
    };

    for await (const user of users) {
      batch.push(user);
      if (batch.length >= CONCURRENCY) await flush();
    }
    await flush();

    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    console.error("Erreur lors de l'envoi des emails hebdomadaires aux utilisateurs :", error);
    return NextResponse.json({
      ok: false,
      error: 'Erreur lors de l\'envoi des emails hebdomadaires aux utilisateurs.'
    }, { status: 500 });
  }
}
