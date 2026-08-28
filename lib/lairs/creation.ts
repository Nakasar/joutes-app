import type { GeoJSONPoint, Lair } from "@/lib/types/Lair";

/**
 * Ce qu'un compte peut ouvrir comme lieux **publics**, et ce qui distingue un
 * doublon d'un homonyme.
 *
 * Ces règles vivent ici, sans base ni session, parce qu'elles sont exactement
 * la partie qui mérite d'être vérifiée : le reste de la création n'est qu'une
 * écriture. Voir `lib/lairs/create.ts` pour leur mise en œuvre.
 */

/**
 * Le nombre de lieux publics qu'un même compte peut créer.
 *
 * Un gérant tient une, parfois deux boutiques ; trois laisse de la marge à qui
 * anime plusieurs salles, tout en fermant la porte à qui ouvrirait l'annuaire
 * par dizaines. Ce plafond ne compte **que** les lieux publics créés par le
 * compte : recevoir la gestion d'un lieu existant n'y entre pas, et les lieux
 * privés, invisibles de l'annuaire, ne coûtent rien à personne.
 */
export const MAX_PUBLIC_LAIRS_PER_OWNER = 3;

/**
 * En deçà de cette distance, deux lieux publics de même nom sont tenus pour le
 * même endroit.
 *
 * Vingt-cinq kilomètres, c'est l'échelle d'une agglomération : « L'Antre du
 * Dragon » à Villeurbanne et à Lyon est la même boutique saisie deux fois, quand
 * le même nom à Lyon et à Nantes désigne deux enseignes sans rapport.
 */
export const DUPLICATE_RADIUS_KM = 25;

/** Rayon terrestre moyen, en kilomètres. */
const EARTH_RADIUS_KM = 6371;

/**
 * Le nom d'un lieu réduit à ce qui le distingue vraiment.
 *
 * Casse, accents, espaces et ponctuation sautent : « L'Antre-Temps »,
 * « lantre temps » et « L'ANTRE TEMPS » désignent la même boutique, et refuser
 * le doublon seulement quand la frappe coïncide au caractère près ne servirait
 * à rien. Les séparateurs disparaissent au lieu de devenir un espace, sans quoi
 * l'apostrophe de « L'Antre » suffirait à le distinguer de « Lantre » — c'est
 * exactement la variante que deux personnes saisissent pour la même enseigne.
 *
 * Le repli sur la casse seule n'est pas décoratif : la réduction ne garde que
 * les lettres latines et les chiffres, si bien qu'un nom entièrement écrit dans
 * une autre écriture se réduirait à la chaîne vide — et tous ces noms
 * deviendraient doublons les uns des autres.
 */
export function normalizeLairName(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return stripped === "" ? name.toLowerCase().replace(/\s+/g, " ").trim() : stripped;
}

/** Deux noms désignent-ils le même lieu, à la casse et à la ponctuation près ? */
export function isSameLairName(a: string, b: string): boolean {
  return normalizeLairName(a) === normalizeLairName(b);
}

/**
 * La distance à vol d'oiseau entre deux points GeoJSON, en kilomètres.
 *
 * Formule de haversine : à l'échelle qui nous intéresse — quelques dizaines de
 * kilomètres — elle est largement assez juste, et n'exige aucune dépendance.
 *
 * GeoJSON ordonne les coordonnées **longitude puis latitude**, à rebours de
 * l'usage : c'est l'inversion la plus facile à commettre ici.
 */
export function distanceKm(a: GeoJSONPoint, b: GeoJSONPoint): number {
  const [lonA, latA] = a.coordinates;
  const [lonB, latB] = b.coordinates;

  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Les coordonnées d'un formulaire, retournées dans l'ordre GeoJSON.
 *
 * La conversion vit ici, à un seul endroit, parce que l'inversion latitude /
 * longitude est l'erreur la plus facile à commettre de toute cette
 * fonctionnalité : un lieu lyonnais enregistré à l'envers atterrit au large de
 * la Somalie, et la recherche autour de soi ne le trouve plus jamais.
 */
export function toLairLocation(
  coordinates: { latitude: number; longitude: number } | undefined
): GeoJSONPoint | undefined {
  if (!coordinates) {
    return undefined;
  }

  return { type: "Point", coordinates: [coordinates.longitude, coordinates.latitude] };
}

/** Le lieu candidat, réduit à ce dont la comparaison a besoin. */
export type LairCandidate = Pick<Lair, "id" | "name" | "location">;

/**
 * Parmi les lieux publics déjà connus, celui que la création s'apprête à
 * dupliquer — ou `null` si le nom est libre.
 *
 * Deux conditions, et les deux comptent : le même nom **et** le même endroit.
 * Le nom seul refuserait « Le Repaire » à Nantes parce qu'un « Repaire »
 * existe à Lyon ; l'endroit seul empêcherait deux boutiques d'une même rue.
 *
 * Un lieu sans coordonnées est tenu pour un doublon dès que le nom coïncide.
 * C'est le choix prudent : on ne sait pas où il est, donc on ne peut pas
 * affirmer qu'il s'agit d'un autre endroit — et l'écran de création propose
 * alors le lieu existant, ce qui est précisément ce qu'il faut faire quand
 * c'est bien le même.
 */
export function findDuplicateLair(
  candidates: LairCandidate[],
  input: { name: string; location?: GeoJSONPoint }
): LairCandidate | null {
  for (const candidate of candidates) {
    if (!isSameLairName(candidate.name, input.name)) {
      continue;
    }

    if (!candidate.location || !input.location) {
      return candidate;
    }

    if (distanceKm(candidate.location, input.location) <= DUPLICATE_RADIUS_KM) {
      return candidate;
    }
  }

  return null;
}
