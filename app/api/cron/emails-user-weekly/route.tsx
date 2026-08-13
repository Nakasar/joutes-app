import { NextResponse } from 'next/server';
import db from "@/lib/mongodb";
import {Resend} from "resend";
import {User} from "@/lib/types/User";
import {DateTime} from "luxon";
import UserWeeklyEmail from "@/app/api/cron/emails-user-weekly/user-weekly-email";
import {getEventsForUser} from "@/lib/db/events";
import {WEEKLY_DIGEST_COOLDOWN_DAYS, weeklyDigestFilter} from "@/lib/notifications/weekly-digest";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const today = DateTime.utc();
  const endDate = today.plus({ weeks: 1 }).endOf('day');

  try {
    // Le filtre est partagé avec le récapitulatif push
    // (`lib/notifications/weekly-digest.ts`) : chaque canal garde sa propre
    // mémoire d'envoi, mais la règle d'éligibilité est écrite une fois.
    const users = db
      .collection<User>("user")
      .find(weeklyDigestFilter("emails", today.minus({ days: WEEKLY_DIGEST_COOLDOWN_DAYS }).toISO()!));

    while (await users.hasNext()) {
      const user = await users.next();

      if (user?.email && user?.displayName) {
        const events = await getEventsForUser(user._id.toString(), 'followed', undefined, undefined, undefined, undefined, {
          afterDate: today.toISO(),
          beforeDate: endDate.toISO(),
        });

        await db.collection("user").updateOne({
          _id: user._id,
        }, {
          $set: {
            "notifications.emails.weekly.lastSent": today.toISO(),
          },
        });
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "onboarding@resend.dev",
          to: user.email,
          subject: `Votre newsletter hebdomadaire Joutes du ${today.setZone('Europe/Paris').toFormat('dd/MM', { locale: 'fr' })}`,
          react: <UserWeeklyEmail today={today} username={user.displayName} events={events} />,
        });
      }
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi des emails hebdomadaires aux utilisateurs :", error);
    return NextResponse.json({
      ok: false,
      error: 'Erreur lors de l\'envoi des emails hebdomadaires aux utilisateurs.'
    }, { status: 500 });
  }
}