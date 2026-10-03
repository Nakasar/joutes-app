/**
 * Événements liés à un événement, affichés sur sa page.
 *
 * Deux sources :
 * — les **liens posés** par l'organisation, dans un sens ou dans l'autre :
 *   un lien de A vers B s'affiche sur les deux pages ;
 * — à défaut, les **titres proches** : les prochains événements du même lieu
 *   dont le titre, débarrassé de ce qui distingue deux séances d'une même
 *   série (parenthèses, jours de la semaine, ponctuation), est le même ou
 *   presque, ou dont l'un prolonge l'autre. « Avant Première - Homeworlds
 *   (Samedi) » et « … (Dimanche) » se retrouvent ainsi, comme « Avant-Première
 *   - Réalité Fracturée » et « … - Troll à 2 Têtes ».
 */

/** Ce qu'il faut d'un événement pour le comparer et l'afficher. */
export type RelatedEventCandidate = {
  id: string;
  name: string;
  startDateTime: string;
  status?: string;
};

/** Nombre d'événements proposés au titre de la ressemblance. */
export const SIMILAR_EVENTS_LIMIT = 3;

/** Part de mots communs à partir de laquelle deux titres se ressemblent. */
const SIMILARITY_THRESHOLD = 0.75;

/**
 * Mots distinctifs qu'un titre doit compter pour qu'un titre qui le prolonge
 * lui ressemble. Voir `GENERIC_WORDS`.
 */
const EXTENDED_TITLE_MIN_WORDS = 4;

// Mots qui ne disent pas de quel événement il s'agit : articles et
// prépositions, et mots génériques des titres d'événements de jeu. Ils ne
// comptent pas pour savoir si un titre désigne un événement précis.
const GENERIC_WORDS = new Set([
  "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "a", "au", "aux", "et", "en", "sur", "pour", "avec",
  "the", "of", "and", "an", "at", "in", "on", "for", "with",
  "der", "die", "das", "den", "dem", "ein", "eine", "und", "im", "am", "mit", "zum", "zur",
  "il", "lo", "gli", "di", "da", "e", "con", "per", "del", "della",
  "tournoi", "tournois", "soiree", "soirees", "evenement", "ligue", "hebdo", "hebdomadaire", "casual", "initiation",
  "tournament", "night", "event", "league", "weekly", "turnier", "abend", "torneo", "serata",
  "jeu", "jeux", "game", "games", "card", "cards", "tcg", "jcc", "spiel", "gioco",
]);

// Jours de la semaine des langues de l'application : ils distinguent deux
// séances d'une même série, pas deux événements.
const WEEKDAYS = new Set([
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
  "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica",
]);

/**
 * Mots significatifs d'un titre : minuscules, sans accents, sans ce qui est
 * entre parenthèses ou crochets, sans ponctuation ni jours de la semaine.
 */
export function titleWords(title: string): string[] {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !WEEKDAYS.has(word));
}

/** Ressemblance de deux titres, de 0 (aucun mot commun) à 1 (mêmes mots). */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(titleWords(a));
  const wordsB = new Set(titleWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared++;
  return shared / (wordsA.size + wordsB.size - shared);
}

/**
 * Un titre en prolonge un autre quand il en reprend tous les mots et en
 * ajoute : « Avant-Première - Réalité Fracturée - Troll à 2 Têtes » prolonge
 * « Avant-Première - Réalité Fracturée ».
 *
 * Le titre court doit compter assez de mots distinctifs pour désigner un
 * événement précis, et pas seulement un jeu : « Soirée Star Wars Unlimited »
 * ne doit pas attirer toutes les soirées du jeu. Il doit aussi faire au moins
 * la moitié du titre long.
 */
function extendsTitle(a: string, b: string): boolean {
  const wordsA = new Set(titleWords(a));
  const wordsB = new Set(titleWords(b));
  const [shorter, longer] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
  let distinctive = 0;
  for (const word of shorter) if (!GENERIC_WORDS.has(word)) distinctive++;
  if (distinctive < EXTENDED_TITLE_MIN_WORDS) return false;
  if (shorter.size * 2 < longer.size) return false;
  for (const word of shorter) if (!longer.has(word)) return false;
  return true;
}

export function areSimilarTitles(a: string, b: string): boolean {
  return titleSimilarity(a, b) >= SIMILARITY_THRESHOLD || extendsTitle(a, b);
}

function startMillis(event: RelatedEventCandidate): number {
  const time = Date.parse(event.startDateTime);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

const bySoonest = (a: RelatedEventCandidate, b: RelatedEventCandidate) => startMillis(a) - startMillis(b);

/**
 * Les événements à afficher : d'abord les liens posés (tous, du plus proche au
 * plus lointain), puis jusqu'à `limit` événements à venir au titre proche, le
 * plus proche en premier. Ni l'événement lui-même, ni un événement déjà lié,
 * ni un événement annulé ne sont proposés au titre de la ressemblance.
 */
export function pickRelatedEvents<T extends RelatedEventCandidate>({
  event,
  linked,
  candidates,
  now,
  limit = SIMILAR_EVENTS_LIMIT,
}: {
  event: RelatedEventCandidate;
  linked: T[];
  candidates: T[];
  now: Date;
  limit?: number;
}): { linked: T[]; similar: T[] } {
  const linkedEvents = linked.filter((entry) => entry.id !== event.id).sort(bySoonest);
  const excluded = new Set([event.id, ...linkedEvents.map((entry) => entry.id)]);

  const similar = candidates
    .filter(
      (entry) =>
        !excluded.has(entry.id) &&
        entry.status !== "cancelled" &&
        startMillis(entry) >= now.getTime() &&
        startMillis(entry) !== Number.POSITIVE_INFINITY &&
        areSimilarTitles(entry.name, event.name)
    )
    .sort(bySoonest)
    .slice(0, limit);

  return { linked: linkedEvents, similar };
}

/**
 * Identifiant d'événement tiré de ce que l'organisation colle : un lien vers
 * la page de l'événement, ou l'identifiant lui-même.
 */
export function parseEventReference(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/\/events\/([^/?#\s]+)/);
  const id = fromUrl ? fromUrl[1] : trimmed;
  return /^[\w-]+$/.test(id) ? id : null;
}
