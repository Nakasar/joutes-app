import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/geo/places";

/**
 * Recherche de localités par nom de ville ou code postal, pour les champs à
 * autocomplétion (« Proches de moi », localisation du compte).
 *
 * Le relais côté serveur n'est pas décoratif : il porte l'en-tête `User-Agent`
 * que Photon demande à ses appelants, il permet de mettre les réponses en cache
 * — les mêmes villes reviennent d'un visiteur à l'autre — et il laisse la
 * liberté de changer de fournisseur sans retoucher le navigateur.
 *
 * Ouvert aux visiteurs non connectés : la recherche d'évènements autour de soi
 * l'est aussi.
 */

/** En deçà, la recherche ne discrimine rien et coûte un appel pour rien. */
const MIN_QUERY_LENGTH = 2;

/** Au-delà, ce n'est plus un nom de ville. */
const MAX_QUERY_LENGTH = 120;

const MAX_RESULTS = 6;

/** Un fournisseur muet ne doit pas retenir la frappe de l'utilisateur. */
const UPSTREAM_TIMEOUT_MS = 4000;

/**
 * Les noms de villes ne bougent pas d'une heure à l'autre. Le cache mémoire ne
 * vaut que pour une instance chaude — d'où l'en-tête `Cache-Control`, qui fait
 * porter l'essentiel de l'effort au CDN et au navigateur.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Borne le cache : une frappe lettre à lettre y verse une entrée par touche. */
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = { expiresAt: number; body: string };

const cache = new Map<string, CacheEntry>();

function readCache(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  // Remise en fin de file : les entrées réellement utilisées survivent à
  // l'éviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry.body;
}

function writeCache(key: string, body: string): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, body });
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const lang = (request.nextUrl.searchParams.get("lang") ?? "").trim().toLowerCase();

  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ places: [] });
  }

  const cacheKey = `${lang}|${query.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return new NextResponse(cached, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  }

  try {
    const places = await searchPlaces(query, {
      lang,
      limit: MAX_RESULTS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const body = JSON.stringify({ places });
    writeCache(cacheKey, body);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Recherche de localité impossible:", error);
    return NextResponse.json({ error: "Service de localisation indisponible" }, { status: 502 });
  }
}
