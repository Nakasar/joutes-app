import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEventsByLairId, getEventsForUser, getEventsByLairIds } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import { getLairIdsNearLocation } from "@/lib/db/lairs";

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
    const allGames = searchParams.get("allGames") === "true";
    const lairId = searchParams.get("lairId");
    const userLat = searchParams.get("userLat");
    const userLon = searchParams.get("userLon");
    const maxDistance = searchParams.get("maxDistance");

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
      events = await getEventsByLairId(lairId, {
        year: yearNum,
        month: monthNum, 
        userId: session?.user?.id,
        allGames
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
        
        // Récupérer les événements pour ces lairs
        const allEvents = await getEventsByLairIds(nearbyLairIds);
        
        // Filtrer par mois/année si spécifié
        events = allEvents.filter(event => {
          const eventDate = new Date(event.startDateTime);
          const eventMonth = eventDate.getMonth() + 1;
          const eventYear = eventDate.getFullYear();
          
          if (monthNum && eventMonth !== monthNum) return false;
          if (yearNum && eventYear !== yearNum) return false;
          
          return true;
        });
      } else if (!session?.user) {
        // Si pas d'utilisateur et pas de localisation, retourner un tableau vide
        return NextResponse.json({ events: [] });
      } else {
        // Utilisateur connecté, utiliser la fonction normale
        events = await getEventsForUser(
          session.user.id,
          allGames,
          monthNum,
          yearNum,
          userLocation,
          maxDistanceNum
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
