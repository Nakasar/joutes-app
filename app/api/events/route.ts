import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEventsByLairId, getEventsForUser } from "@/lib/db/events";

export async function GET(request: NextRequest) {
  try {
    // Get session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const allGames = searchParams.get("allGames") === "true";
    const lairId = searchParams.get("lairId");

    // Validate month and year
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;

    if (
      (monthNum && (monthNum < 1 || monthNum > 12)) ||
      (yearNum && (yearNum < 2000 || yearNum > 3000))
    ) {
      return NextResponse.json(
        { error: "Paramètres de date invalides" },
        { status: 400 }
      );
    }

    // Get events for the user (with lair details included)
    const events = lairId ? await getEventsByLairId(lairId, {
      year: yearNum,
      month: monthNum,
      userId: session.user.id,
      allGames
    }) : await getEventsForUser(
      session.user.id,
      allGames,
      monthNum,
      yearNum
    );

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des événements" },
      { status: 500 }
    );
  }
}
