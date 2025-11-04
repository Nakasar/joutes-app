import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEventsForUser } from "@/lib/db/events";
import { getLairById } from "@/lib/db/lairs";
import { getUserById } from "@/lib/db/users";
import { Lair } from "@/lib/types/Lair";

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

    // Get user to check lairs and games
    const user = await getUserById(session.user.id);
    
    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    // Get events for the user
    const events = await getEventsForUser(
      session.user.id,
      allGames,
      monthNum,
      yearNum
    );

    // Get lairs details
    const lairsDetails = await Promise.all(
      user.lairs.map(lairId => getLairById(lairId))
    );
    const lairs = lairsDetails.filter((lair): lair is Lair => lair !== null);

    // Create a map of lairs
    const lairsMap: Record<string, Lair> = {};
    lairs.forEach((lair) => {
      lairsMap[lair.id] = lair;
    });

    return NextResponse.json({
      events,
      lairsMap,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des événements" },
      { status: 500 }
    );
  }
}
