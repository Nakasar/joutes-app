import { createElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { ObjectId } from "mongodb";
import { render } from "react-email";

import UserWeeklyEmail from "@/app/api/cron/emails-user-weekly/user-weekly-email";
import { auth } from "@/lib/auth";
import db from "@/lib/mongodb";
import { readWeeklyEmailSettings, weeklyEmailSubject } from "@/lib/notifications/weekly-email";
import { loadWeeklyEmailContent } from "@/lib/notifications/weekly-email-service";
import type { User } from "@/lib/types/User";

/**
 * L'aperçu de son prochain email hebdomadaire, tel qu'il partirait maintenant
 * avec les sections cochées. Ne touche pas à la date du dernier envoi.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  try {
    const user = await db
      .collection<User>("user")
      .findOne(
        { _id: new ObjectId(session.user.id) },
        {
          projection: {
            displayName: 1, lairs: 1, games: 1, friends: 1, lairNotificationPrefs: 1, location: 1, notifications: 1,
          },
        },
      );
    if (!user) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    const now = DateTime.utc();
    const settings = readWeeklyEmailSettings(user.notifications?.emails?.weekly);
    const content = await loadWeeklyEmailContent(
      {
        id: session.user.id,
        displayName: user.displayName,
        lairs: user.lairs ?? [],
        games: user.games ?? [],
        friends: user.friends ?? [],
        lairNotificationPrefs: user.lairNotificationPrefs,
        location: user.location,
        notifications: user.notifications,
      },
      settings.sections,
      now,
    );
    const subject = weeklyEmailSubject(content, now.toISO()!);
    // `createElement` plutôt que du JSX : le rendu se fait ici même, sous le try.
    const html = await render(createElement(UserWeeklyEmail, { content, subject }));

    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("Erreur lors de l'aperçu de l'email hebdomadaire :", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
