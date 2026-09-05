import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEventsByLairId, getEventsForUser, getEventsByLairIds } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import { getLairIdsNearLocation } from "@/lib/db/lairs";
import { findVisibleLair } from "@/lib/api/lairs";

export async function GET(request: NextRequest) {
  try {
    // Get session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const gameId = searchParams.get("gameId") || "followed"; // Par défaut: jeux suivis
    const lairId = searchParams.get("lairId");
    const userLat = searchParams.get("userLat");
    const userLon = searchParams.get("userLon");
    const maxDistance = searchParams.get("maxDistance");
    // Bornes optionnelles indépendantes du calendrier mois/année, pour un
    // client qui veut "les prochains événements" sans se limiter au mois en
    // cours (ex. afterDate=<now ISO>) ou "les événements passés" à la
    // demande (ex. beforeDate=<now ISO>).
    const afterDateParam = searchParams.get("afterDate");
    const beforeDateParam = searchParams.get("beforeDate");

    // Normalisées en UTC ISO avant d'être comparées (en base) à startDateTime,
    // lui-même stocké en ISO : une entrée non ISO/avec un autre format
    // produirait sinon une comparaison lexicographique incohérente.
    let afterDate: string | undefined;
    let beforeDate: string | undefined;
    if (afterDateParam) {
      const parsed = new Date(afterDateParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Paramètres de date invalides" }, { status: 400 });
      }
      afterDate = parsed.toISOString();
    }
    if (beforeDateParam) {
      const parsed = new Date(beforeDateParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Paramètres de date invalides" }, { status: 400 });
      }
      beforeDate = parsed.toISOString();
    }
    if (afterDate && beforeDate && afterDate > beforeDate) {
      return NextResponse.json({ error: "Paramètres de date invalides" }, { status: 400 });
    }

    // Validate month and year
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;

    // Parse geolocation parameters
    let userLocation: { latitude: number; longitude: number } | undefined;
    let maxDistanceNum: number | undefined;

    if (userLat && userLon) {
      const lat = parseFloat(userLat);
      const lon = parseFloat(userLon);
      if (!isNaN(lat) && !isNaN(lon)) {
        userLocation = { latitude: lat, longitude: lon };
      }
    }

    if (maxDistance) {
      const dist = parseFloat(maxDistance);
      if (!isNaN(dist) && dist > 0) {
        maxDistanceNum = dist;
      }
    }

    if (
      (monthNum && (monthNum < 1 || monthNum > 12)) ||
      (yearNum && (yearNum < 2000 || yearNum > 3000))
    ) {
      return NextResponse.json(
        { error: "Paramètres de date invalides" },
        { status: 400 }
      );
    }

    let events: Event[];
    if (lairId) {
      // La confidentialité du lieu vaut aussi pour son agenda : `lairId` est
      // fourni par l'appelant, et rien ici ne vérifiait qu'il avait le droit de
      // lire ce lieu — l'agenda d'un lieu privé sortait donc à qui en
      // devinait l'identifiant. Même porte que `GET /lairs/{lairId}`, et même
      // réponse : 404, jamais 403.
      const lair = await findVisibleLair(lairId, session?.user?.id ?? null);
      if (!lair) {
        return NextResponse.json({ error: "Lieu introuvable" }, { status: 404 });
      }

      events = await getEventsByLairId(lairId, {
        year: yearNum,
        month: monthNum,
        userId: session?.user?.id,
        gameId
      });
    } else {
      // Si pas d'utilisateur connecté mais des paramètres de localisation, rechercher par localisation
      if (!session?.user && userLocation && maxDistanceNum) {
        // Obtenir les IDs des lairs à proximité
        const nearbyLairIds = await getLairIdsNearLocation(
          userLocation.longitude,
          userLocation.latitude,
          maxDistanceNum * 1000 // Convertir km en mètres
        );
        
        // Récupérer les événements pour ces lairs. Les bornes de dates et le
        // jeu demandé valent ici comme pour une session : un visiteur qui
        // cherche « les prochains événements autour de Lyon » n'a pas à
        // recevoir ceux du mois dernier, ni ceux d'un jeu qu'il n'a pas
        // demandé. `getEventsByLairIds` filtre déjà en base sur le mois et
        // l'année : le second tri en mémoire ne faisait que le répéter.
        events = await getEventsByLairIds(nearbyLairIds, {
          year: yearNum,
          month: monthNum,
          afterDate,
          beforeDate,
          gameIds: gameId !== "followed" && gameId !== "all" ? [gameId] : undefined,
        });
      } else if (!session?.user) {
        // Si pas d'utilisateur et pas de localisation, retourner un tableau vide
        return NextResponse.json({ events: [] });
      } else {
        // Utilisateur connecté, utiliser la fonction normale
        events = await getEventsForUser(
          session.user.id,
          gameId,
          monthNum,
          yearNum,
          userLocation,
          maxDistanceNum,
          { afterDate, beforeDate }
        );
      }
    }

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des événements" },
      { status: 500 }
    );
  }
}
