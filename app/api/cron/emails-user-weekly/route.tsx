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

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const today = DateTime.utc();
  let sent = 0;
  let skipped = 0;

  try {
    // Le filtre est partagé avec le récapitulatif push
    // (`lib/notifications/weekly-digest.ts`) : chaque canal garde sa propre
    // mémoire d'envoi, mais la règle d'éligibilité est écrite une fois.
    const users = db
      .collection<User & { _id: ObjectId }>("user")
      .find(weeklyDigestFilter("emails", today.minus({ days: WEEKLY_DIGEST_COOLDOWN_DAYS }).toISO()!));

    while (await users.hasNext()) {
      const user = await users.next();
      if (!user?.email || !user?.displayName) continue;

      try {
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

        // La date d'envoi est posée même quand on se tait : la semaine est
        // passée, et les annonces se comptent depuis ce point.
        await db.collection("user").updateOne(
          { _id: user._id },
          { $set: { "notifications.emails.weekly.lastSent": today.toISO() } },
        );

        // Une semaine sans rien à dire n'envoie rien, sauf à qui l'a demandé ;
        // l'invitation à suivre des lieux, elle, part toujours.
        if (settings.skipEmpty && isWeeklyEmailEmpty(content) && !content.followsNothing) {
          skipped += 1;
          continue;
        }

        const subject = weeklyEmailSubject(content, today.toISO()!);
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "onboarding@resend.dev",
          to: user.email,
          subject,
          react: <UserWeeklyEmail content={content} subject={subject} />,
        });
        sent += 1;
      } catch (error) {
        console.error(`Email hebdomadaire non envoyé à ${user._id.toString()} :`, error);
      }
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (error) {
    console.error("Erreur lors de l'envoi des emails hebdomadaires aux utilisateurs :", error);
    return NextResponse.json({
      ok: false,
      error: 'Erreur lors de l\'envoi des emails hebdomadaires aux utilisateurs.'
    }, { status: 500 });
  }
}
