/**
 * Recherche de localités par nom de ville ou code postal.
 *
 * La plateforme n'avait jusqu'ici que la saisie de coordonnées GPS, qu'un
 * joueur n'a aucune raison de connaître par cœur. Ce module traduit un nom de
 * ville ou un code postal en un point sur la carte, via Photon — le service
 * d'autocomplétion de Komoot adossé aux données OpenStreetMap, libre d'accès et
 * sans clé. Nominatim, l'autre porte d'entrée d'OSM, interdit explicitement
 * l'usage en autocomplétion : c'est précisément ce pour quoi Photon existe.
 *
 * Rien ici ne touche au réseau côté navigateur : l'appel passe par
 * `/api/geo/places`, qui relaie côté serveur (voir la route pour les raisons).
 */

/** Une localité, réduite à ce que l'application en affiche et en mémorise. */
export type Place = {
  /** Clé stable pour les listes et la déduplication. */
  id: string;
  /** Libellé lisible, mémorisé tel quel : « Lyon (69000), France ». */
  label: string;
  city: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
};

/**
 * Ce que l'on mémorise d'une localité à côté de coordonnées : de quoi la
 * renommer plus tard, pas de quoi la retrouver sur la carte. `null` partout
 * signifie des coordonnées sans localité — une position relevée au GPS ou
 * saisie à la main.
 */
export type PlaceRef = {
  label?: string;
  city?: string;
  postalCode?: string;
};

/** Réduit une localité à ce qui l'accompagne en base. */
export function toPlaceRef(place: Place): PlaceRef {
  return {
    label: place.label,
    city: place.city ?? undefined,
    postalCode: place.postalCode ?? undefined,
  };
}

/**
 * Langues que Photon sait rendre. Les autres ne sont pas une erreur : le
 * service répond alors dans la langue locale, ce qui reste utilisable.
 */
const SUPPORTED_LANGS = new Set(["de", "en", "fr", "it"]);

const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";

/**
 * Types de lieux écartés : une adresse ou une rue localise trop finement pour
 * un rayon de recherche exprimé en kilomètres, et noie les villes sous les
 * numéros de voirie.
 */
const EXCLUDED_TYPES = new Set(["house", "street"]);

/** Réponse Photon, dans la seule mesure où ce module la lit. */
type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Libellé d'une localité : la ville, son code postal s'il est connu, puis ce
 * qui la distingue d'une homonyme — région et pays. Les doublons sont écartés
 * en chemin : « Paris, Paris, France » n'apprend rien de plus que « Paris,
 * France ».
 */
function buildLabel(parts: {
  name: string;
  postalCode: string | null;
  state: string | null;
  country: string | null;
}): string {
  const head = parts.postalCode ? `${parts.name} (${parts.postalCode})` : parts.name;
  const tail = [parts.state, parts.country].filter(
    (part): part is string => part !== null && part !== parts.name
  );

  return [head, ...new Set(tail)].join(", ");
}

/**
 * Traduit une entité Photon en `Place`, ou `null` si elle est inexploitable —
 * sans nom ou sans coordonnées, il n'y a rien à afficher ni où chercher.
 *
 * Exportée pour les tests : c'est la partie qui mérite d'être vérifiée, le
 * reste n'étant qu'un appel réseau.
 */
export function toPlace(feature: PhotonFeature): Place | null {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  // GeoJSON ordonne les coordonnées en longitude puis latitude, à rebours de
  // l'usage courant. L'inversion est la faute la plus facile à commettre ici.
  const [longitude, latitude] = coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const type = asString(properties.type);
  if (type && EXCLUDED_TYPES.has(type)) return null;

  // Pour une ville, Photon porte le nom dans `name` et laisse `city` vide ;
  // pour un quartier, l'inverse. Aucun des deux n'est fiable seul.
  const name = asString(properties.name) ?? asString(properties.city);
  if (!name) return null;

  const postalCode = asString(properties.postcode);
  const city = asString(properties.city) ?? name;

  return {
    // Deux entités OSM distinctes peuvent partager un nom ; leur identifiant ne
    // l'est pas. Faute d'`osm_id`, les coordonnées séparent les homonymes.
    id: [asString(properties.osm_type), properties.osm_id ?? `${latitude},${longitude}`]
      .filter(Boolean)
      .join(":"),
    label: buildLabel({
      name,
      postalCode,
      state: asString(properties.state),
      country: asString(properties.country),
    }),
    city,
    postalCode,
    latitude,
    longitude,
  };
}

/**
 * Écarte les entrées qui désignent le même endroit. Photon rend volontiers une
 * ville plusieurs fois — une par entité OSM la recouvrant — et une liste
 * d'autocomplétion qui répète « Lyon » quatre fois n'aide personne.
 *
 * Deux entrées sont tenues pour identiques si leur libellé l'est : c'est ce que
 * l'utilisateur lit, et donc le seul doublon qui le gêne.
 */
export function dedupePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();

  return places.filter((place) => {
    const key = place.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Normalise une réponse Photon complète : entités lisibles, sans doublon. */
export function parsePhotonResponse(payload: unknown, limit: number): Place[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];

  const places = features
    .map((feature) => toPlace(feature as PhotonFeature))
    .filter((place): place is Place => place !== null);

  return dedupePlaces(places).slice(0, limit);
}

/**
 * Interroge Photon. Réservé au serveur : le navigateur passe par
 * `/api/geo/places`.
 *
 * Photon rend souvent plusieurs entités pour un même lieu ; on en demande donc
 * plus que ce que l'on montrera, la déduplication faisant le tri ensuite.
 */
export async function searchPlaces(
  query: string,
  { lang, limit = 5, signal }: { lang?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<Place[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(Math.min(limit * 3, 20)));
  if (lang && SUPPORTED_LANGS.has(lang)) url.searchParams.set("lang", lang);

  const response = await fetch(url, {
    signal,
    headers: {
      // Photon demande de pouvoir identifier ses appelants, pour distinguer un
      // usage normal d'un abus.
      "User-Agent": "Joutes (https://joutes.app)",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Photon a répondu ${response.status}`);
  }

  return parsePhotonResponse(await response.json(), limit);
}
