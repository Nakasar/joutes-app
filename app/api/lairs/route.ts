import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { searchLairs } from "@/lib/db/lairs";

/** Rayon par défaut d'une recherche géographique, en kilomètres. */
const DEFAULT_RADIUS_KM = 50;

/** Un nombre fini lu dans la requête, ou `undefined` — jamais `NaN`. */
function readNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * L'annuaire des lieux.
 *
 * Deux ajouts par rapport à ce que cette route servait :
 *
 * **La session compte.** `searchLairs` sait déjà élargir la visibilité à qui
 * est connecté ; la route ne la lui passait pas. Un gérant y voit désormais les
 * lieux privés **qu'il possède** — la requête de visibilité les reconnaît par
 * `owners`, pas par le fait de les suivre. Les suivre ne suffit donc pas à les
 * voir ici, alors que cela ouvre bien `GET /lairs/{lairId}` : l'annuaire est
 * plus prudent que la fiche, et c'est le sens qui va bien.
 *
 * **`lat` / `lng` / `radius` cherchent autour d'un point.** L'index géospatial
 * et le tri par distance existaient déjà en base, sans rien pour les demander.
 * Le rayon est en kilomètres — c'est ce qu'un utilisateur choisit — et converti
 * en mètres pour Mongo. Il faut les deux coordonnées : une seule ne désigne
 * aucun point, et la retenir à moitié filtrerait sur un méridien. Hors du
 * globe, ou avec un rayon nul, la demande rend 400.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");

    const latitude = readNumber(searchParams.get("lat"));
    const longitude = readNumber(searchParams.get("lng"));
    const radius = readNumber(searchParams.get("radius"));
    const near = latitude !== undefined && longitude !== undefined;

    // Mongo lève sur une coordonnée hors du globe, et un rayon nul ou négatif
    // ne décrit aucun disque : sans ces bornes, une demande fautive rendrait
    // 500, c'est-à-dire « le serveur est en panne » là où c'est la question qui
    // n'a pas de sens.
    if (
      near &&
      (latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        (radius !== undefined && radius <= 0))
    ) {
      return NextResponse.json({ error: "Coordonnées invalides" }, { status: 400 });
    }

    const viewer = await authenticateApiRequest(request);

    const result = await searchLairs({
      userId: viewer?.userId,
      gameIds: gameId ? [gameId] : undefined,
      search: search || undefined,
      nearLocation: near
        ? {
            latitude,
            longitude,
            maxDistanceMeters: Math.round((radius ?? DEFAULT_RADIUS_KM) * 1000),
          }
        : undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching lairs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des lieux" },
      { status: 500 }
    );
  }
}
