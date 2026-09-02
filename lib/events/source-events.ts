import { DateTime } from "luxon";
import type { Event } from "@/lib/types/Event";

/**
 * Le rapprochement des événements moissonnés avec ceux déjà en base.
 *
 * Tout ce qui se décide sans la base vit ici, pour être testable : lire une
 * date approximative, reconnaître un événement déjà connu, et dire lequel
 * garder, mettre à jour, annuler ou retirer. `upsertEventsForLair`, dans
 * `lib/db/events.ts`, ne fait qu'exécuter le verdict.
 *
 * Pourquoi tant de soin : un événement en base porte des **favoris** et des
 * **inscriptions**, rattachés à son `id`. Le remplacer par un document neuf,
 * même identique, les efface. Un rafraîchissement doit donc retrouver ce qu'il
 * connaît déjà et le mettre à jour en place, et ne retirer que ce dont il est
 * sûr — ce que l'ancienne version ne faisait pas : elle supprimait à chaque
 * tour les événements qu'elle venait de mettre à jour, faute d'en avoir noté
 * l'identifiant, et les recréait au tour suivant.
 */

export const EVENTS_TIMEZONE = "Europe/Paris";

/** Les auteurs que le rafraîchissement a le droit de réécrire. */
export const AUTOMATED_EVENT_AUTHORS = ["AI-SCRAPPING", "JSON-MAPPING", "HTML-SCRAPPING"] as const;

export type EventStatus = Event["status"];

export type AutomatedEventAuthor = (typeof AUTOMATED_EVENT_AUTHORS)[number];

/**
 * Un événement tel qu'une source le rend, une fois ses champs normalisés.
 *
 * `sourceUrl` est l'URL **configurée** de la source, pas celle de la page de
 * l'événement : c'est la clé qui permet de ne retirer que les événements
 * d'une source qu'on a vraiment relue.
 */
export type SourceEvent = {
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  price?: number;
  status: EventStatus;
  url?: string;
  addedBy: AutomatedEventAuthor;
  sourceUrl: string;
  /** L'identifiant de l'événement chez la source, quand elle en donne un. */
  externalId?: string;
};

/** Ce qu'il faut d'un événement en base pour le rapprocher. */
export type StoredEvent = Pick<
  Event,
  "id" | "name" | "startDateTime" | "endDateTime" | "gameName" | "price" | "status" | "url" | "addedBy" | "favoritedBy" | "participants" | "source"
>;

/** Les champs qu'un rafraîchissement réécrit sur un événement retrouvé. */
export type SourceEventPatch = Pick<
  Event,
  "name" | "startDateTime" | "endDateTime" | "gameName" | "price" | "status" | "url" | "source"
>;

export type Reconciliation = {
  /** Les événements inconnus jusqu'ici. */
  toInsert: SourceEvent[];
  /** Les événements retrouvés dont quelque chose a changé. */
  toUpdate: { existing: StoredEvent; patch: SourceEventPatch }[];
  /** Les événements retrouvés à l'identique. */
  unchanged: StoredEvent[];
  /** Disparus de leur source, mais suivis par quelqu'un : annulés, pas retirés. */
  toCancel: StoredEvent[];
  /** Disparus de leur source, et que personne ne suit. */
  toDelete: StoredEvent[];
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * La fenêtre dans laquelle on cherche l'année d'une date sans année.
 *
 * Une page d'agenda annonce surtout ce qui vient, et garde un peu de ce qui
 * vient d'avoir lieu : deux mois en arrière, dix en avant. Asymétrique à
 * dessein — en décembre, « 15 janvier » désigne le mois prochain, pas celui
 * d'il y a onze mois.
 */
const YEAR_WINDOW_BEFORE_DAYS = 60;
const YEAR_WINDOW_AFTER_DAYS = 305;

/**
 * Une année lue dans la source qu'on peut croire : l'an dernier, cette année,
 * ou deux ans devant. Au-delà, c'est une valeur inventée.
 */
const TRUSTED_YEAR_BEHIND = 1;
const TRUSTED_YEAR_AHEAD = 2;

/**
 * Lit une date telle qu'une source la donne.
 *
 * ISO d'abord — ce qu'un JSON ou le modèle rendent —, puis les formes qu'on
 * rencontre dans les exports maison : SQL (`2026-03-15 20:00:00`), RFC 2822,
 * HTTP, et un horodatage numérique en secondes ou en millisecondes.
 */
export function parseSourceDate(value: unknown, zone: string = EVENTS_TIMEZONE): DateTime | null {
  if (value instanceof Date) {
    const date = DateTime.fromJSDate(value, { zone });
    return date.isValid ? date : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Sous 10^11, c'est forcément des secondes : en millisecondes, ce serait
    // avant avril 1973.
    const date = value < 1e11 ? DateTime.fromSeconds(value, { zone }) : DateTime.fromMillis(value, { zone });
    return date.isValid ? date : null;
  }

  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  if (/^\d{9,13}$/.test(text)) {
    return parseSourceDate(Number.parseInt(text, 10), zone);
  }

  const candidates = [
    DateTime.fromISO(text, { zone }),
    DateTime.fromSQL(text, { zone }),
    DateTime.fromRFC2822(text, { zone }),
    DateTime.fromHTTP(text, { zone }),
    DateTime.fromFormat(text, "dd/MM/yyyy HH:mm", { zone }),
    DateTime.fromFormat(text, "dd/MM/yyyy", { zone }),
  ];

  return candidates.find((date) => date.isValid) ?? null;
}

/**
 * Replace une date dans l'année qui a du sens vu d'aujourd'hui.
 *
 * Deux régimes :
 *
 * - `trustYear` — la source donne des dates complètes (un JSON) : on garde son
 *   année tant qu'elle est plausible. L'ancienne version forçait l'année en
 *   cours sur tout le monde : un tournoi de janvier 2027, lu en septembre
 *   2026, partait en janvier 2026, dans le passé, et disparaissait aussitôt.
 *
 * - sinon — la page ne donne que « samedi 15 mars » et le modèle a dû inventer
 *   une année : on prend, entre l'an dernier, cette année et l'an prochain,
 *   celle qui place la date dans la fenêtre d'un agenda, à défaut la plus
 *   proche d'aujourd'hui.
 */
export function resolveEventYear(date: DateTime, now: DateTime, { trustYear }: { trustYear: boolean }): DateTime {
  if (trustYear && date.year >= now.year - TRUSTED_YEAR_BEHIND && date.year <= now.year + TRUSTED_YEAR_AHEAD) {
    return date;
  }

  const windowStart = now.minus({ days: YEAR_WINDOW_BEFORE_DAYS });
  const windowEnd = now.plus({ days: YEAR_WINDOW_AFTER_DAYS });

  const candidates = [now.year - 1, now.year, now.year + 1]
    .map((year) => date.set({ year }))
    .filter((candidate) => candidate.isValid);

  const inWindow = candidates.find((candidate) => candidate >= windowStart && candidate <= windowEnd);
  if (inWindow) return inWindow;

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.diff(now).toMillis()) < Math.abs(best.diff(now).toMillis()) ? candidate : best,
  );
}

/** Durée prêtée à un événement dont la source ne dit pas quand il finit. */
const DEFAULT_EVENT_DURATION_HOURS = 4;

/**
 * Les deux bornes d'un événement, prêtes à écrire.
 *
 * Rend `null` si le début est illisible : un événement sans date n'a pas de
 * place dans un calendrier. Une fin illisible, ou avant le début, est
 * reconstruite : « 20 h — 1 h » se lit comme finissant le lendemain quand la
 * source a mis la même date aux deux bornes, et une fin franchement absurde
 * retombe sur quatre heures après le début.
 */
export function resolveEventDates(
  { start, end, now, trustYear }: { start: unknown; end: unknown; now: DateTime; trustYear: boolean },
): { startDateTime: string; endDateTime: string } | null {
  const parsedStart = parseSourceDate(start);
  if (!parsedStart) return null;

  const startDate = resolveEventYear(parsedStart, now, { trustYear });

  const parsedEnd = parseSourceDate(end);
  let endDate = parsedEnd ? resolveEventYear(parsedEnd, now, { trustYear }) : null;

  if (endDate && endDate < startDate) {
    const nextDay = endDate.plus({ days: 1 });
    endDate = nextDay > startDate && nextDay.diff(startDate, "hours").hours <= 24 ? nextDay : null;
  }

  if (!endDate) {
    endDate = startDate.plus({ hours: DEFAULT_EVENT_DURATION_HOURS });
  }

  return {
    startDateTime: startDate.setZone(EVENTS_TIMEZONE).toISO() as string,
    endDateTime: endDate.setZone(EVENTS_TIMEZONE).toISO() as string,
  };
}

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

/**
 * Les mots par lesquels les sources disent « disponible », « complet » et
 * « annulé ». En minuscules, sans accent.
 */
const STATUS_SYNONYMS: Record<string, EventStatus> = {
  available: "available",
  open: "available",
  opened: "available",
  ouvert: "available",
  disponible: "available",
  scheduled: "available",
  planned: "available",
  active: "available",
  published: "available",
  confirmed: "available",
  "sold-out": "sold-out",
  soldout: "sold-out",
  "sold out": "sold-out",
  full: "sold-out",
  complet: "sold-out",
  complete: "sold-out",
  closed: "sold-out",
  cancelled: "cancelled",
  canceled: "cancelled",
  annule: "cancelled",
  cancel: "cancelled",
  deleted: "cancelled",
  archived: "cancelled",
};

/** Lit un statut, quelle que soit la façon dont la source l'écrit. */
export function normalizeEventStatus(value: unknown): EventStatus | null {
  if (typeof value === "boolean") {
    return value ? "available" : "sold-out";
  }

  if (typeof value !== "string") return null;

  const key = stripAccents(value).trim().toLowerCase();
  return STATUS_SYNONYMS[key] ?? null;
}

/** Lit un prix : `12`, `"12.5"`, `"12,50 €"`, `"Gratuit"`. */
export function normalizeEventPrice(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== "string") return undefined;

  const text = stripAccents(value).trim().toLowerCase();
  if (!text) return undefined;
  if (/^(gratuit|free|offert|0)$/.test(text)) return 0;

  const match = text.replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;

  const price = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

/**
 * Résout un lien d'événement contre la page dont il vient.
 *
 * Le modèle rend parfois un chemin relatif malgré la consigne, et un JSON
 * donne souvent un identifiant à coller derrière un préfixe. Rend `undefined`
 * pour tout ce qui n'est pas une adresse http(s) : une URL invalide en base
 * ferait échouer la validation d'un événement à sa prochaine édition.
 */
export function resolveEventUrl(value: unknown, base: string): string | undefined {
  if (typeof value !== "string") return undefined;

  const text = value.trim();
  if (!text) return undefined;

  try {
    const url = new URL(text, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * La forme sous laquelle deux noms se comparent : sans casse, sans accent,
 * sans ponctuation, sans doubles espaces. « Soirée Riftbound ! » et
 * « soiree riftbound » sont le même événement.
 */
export function normalizeEventName(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le nom sous lequel la plateforme connaît un jeu, à la casse et aux accents
 * près, en passant d'abord par les alias de la source — « MTG » → « Magic:
 * The Gathering ». Les listes d'événements font une jointure **exacte** sur
 * `gameName` : un « riftbound » en minuscules n'apparaîtrait sur aucun
 * agenda. Rend `null` pour un jeu que la plateforme ne connaît pas.
 */
export function canonicalGameName(
  name: string,
  games: { name: string }[],
  aliases: Record<string, string> = {},
): string | null {
  const wanted = normalizeEventName(name);
  if (!wanted) return null;

  const alias = Object.entries(aliases).find(([key]) => normalizeEventName(key) === wanted)?.[1];
  const lookup = alias ? normalizeEventName(alias) : wanted;

  return games.find((game) => normalizeEventName(game.name) === lookup)?.name ?? null;
}

/**
 * Le jeu que mentionne un texte libre — un titre d'événement où le jeu n'est
 * pas un segment à part : « Avant Premiere MTG Réalité Fracturée ». On cherche
 * chaque nom de jeu et chaque alias comme mot entier, à la casse et aux
 * accents près, et on garde le plus long. Rend le nom **canonique**.
 */
export function findGameInText(
  text: string,
  games: { name: string }[],
  aliases: Record<string, string> = {},
): string | null {
  const haystack = ` ${normalizeEventName(text)} `;
  if (haystack.trim() === "") return null;

  const candidates = [
    ...games.map((game) => ({ key: normalizeEventName(game.name), canonical: game.name })),
    ...Object.entries(aliases).map(([key, target]) => ({ key: normalizeEventName(key), canonical: target })),
  ].filter((candidate) => candidate.key !== "");

  const found = candidates
    .filter((candidate) => haystack.includes(` ${candidate.key} `))
    .sort((left, right) => right.key.length - left.key.length)[0];

  if (!found) return null;
  return canonicalGameName(found.canonical, games, aliases);
}

/**
 * Le statut que trahit un texte libre — un stock de boutique, une mention
 * « complet », un bandeau « annulé » —, quand aucun mot exact ne l'a donné.
 */
export function inferStatusFromText(text: string): EventStatus | null {
  // Avant la normalisation, qui perd le signe : « -1 restante », c'est une
  // place de trop, pas une de libre.
  if (/-\s*\d+\s*(restante|place|dispo)/i.test(text)) return "sold-out";

  const normalized = normalizeEventName(text);
  if (!normalized) return null;

  if (/\bannul/.test(normalized)) return "cancelled";
  if (/rupture|epuis|indisponible|complet|sold out|soldout|plus de place|ferme/.test(normalized)) return "sold-out";
  // « 8 restantes », « 1 restante », et « 0 restante » ou « -1 restante »
  // quand tout est pris — le signe s'est perdu dans la normalisation, mais un
  // zéro suffit.
  if (/\b0 (restante|place|dispo)/.test(normalized)) return "sold-out";
  if (/\b[1-9]\d* (restante|place|dispo)/.test(normalized)) return "available";
  if (/en stock|disponible|available|ouvert|inscription|place/.test(normalized)) return "available";

  return null;
}

// ---------------------------------------------------------------------------
// Rapprochement
// ---------------------------------------------------------------------------

/** Le jour, heure de Paris, où un événement commence — la maille des rapprochements. */
function startDay(isoDate: string): string | null {
  const date = DateTime.fromISO(isoDate, { zone: EVENTS_TIMEZONE });
  return date.isValid ? date.toISODate() : null;
}

function startMillis(isoDate: string): number | null {
  const date = DateTime.fromISO(isoDate);
  return date.isValid ? date.toMillis() : null;
}

function isAutomated(event: Pick<Event, "addedBy">): boolean {
  return (AUTOMATED_EVENT_AUTHORS as readonly string[]).includes(event.addedBy);
}

/** Quelqu'un tient-il à cet événement ? Un favori ou une inscription suffit. */
export function isFollowed(event: Pick<Event, "favoritedBy" | "participants">): boolean {
  return (event.favoritedBy?.length ?? 0) > 0 || (event.participants?.length ?? 0) > 0;
}

/**
 * Un événement qui n'a pas encore commencé — le seul dont l'absence d'une
 * page d'agenda veut dire quelque chose. Une boutique retire un événement de
 * son agenda sitôt qu'il a eu lieu : le retirer ou l'annuler à ce moment-là
 * effacerait une soirée qui s'est bel et bien tenue, et les présences avec.
 * Un début illisible compte comme passé : on ne retire pas ce qu'on ne sait
 * pas dater.
 */
export function hasNotStarted(event: Pick<Event, "startDateTime">, now: DateTime): boolean {
  const start = DateTime.fromISO(event.startDateTime);
  if (!start.isValid) return false;
  return start > now;
}

type Matcher = (incoming: SourceEvent, candidate: StoredEvent, now: DateTime) => boolean;

const sameExternalId: Matcher = (incoming, candidate) =>
  incoming.externalId !== undefined &&
  candidate.source?.externalId === incoming.externalId &&
  candidate.source?.url === incoming.sourceUrl;

const sameUrlAndDay: Matcher = (incoming, candidate) =>
  incoming.url !== undefined &&
  candidate.url === incoming.url &&
  startDay(candidate.startDateTime) === startDay(incoming.startDateTime);

const sameNameAndDay: Matcher = (incoming, candidate) =>
  normalizeEventName(candidate.name) === normalizeEventName(incoming.name) &&
  startDay(candidate.startDateTime) === startDay(incoming.startDateTime);

// Seulement vers un événement pas encore commencé : une page « /soirees »
// partagée par toutes les soirées de l'année ne doit pas faire glisser celle
// de la semaine dernière — et ses présences — sur une date nouvelle.
const sameUrl: Matcher = (incoming, candidate, now) =>
  incoming.url !== undefined && candidate.url === incoming.url && hasNotStarted(candidate, now);

const sameSlotAndGame: Matcher = (incoming, candidate) =>
  normalizeEventName(candidate.gameName) === normalizeEventName(incoming.gameName) &&
  startMillis(candidate.startDateTime) !== null &&
  startMillis(candidate.startDateTime) === startMillis(incoming.startDateTime);

/**
 * Les règles de reconnaissance, de la plus sûre à la plus large. Elles
 * s'appliquent **en passes successives** sur tout le lot : une règle stricte
 * sert tous les événements qu'elle peut avant qu'une règle large n'en prenne
 * un. Sinon, « Soirée Riftbound » du mardi, traité en premier, pourrait
 * capturer par son URL partagée le document du jeudi avant que celui-ci ne
 * réclame le sien.
 *
 * 1. Même identifiant chez la même source — ce qu'un JSON bien fait donne.
 * 2. Même page d'événement, même jour — un lien partagé par plusieurs dates
 *    (« /soirees-riftbound ») ne mélange pas les jours.
 * 3. Même nom, même jour — ce que le modèle rend le plus fidèlement d'une
 *    fois sur l'autre, quand il n'y a pas de lien.
 * 4. Même page d'événement, pas encore commencé — la date a bougé : on garde
 *    le document et ses favoris, la date suit.
 * 5. Même créneau exact, même jeu — l'événement a été renommé.
 *
 * Quand une règle admet plusieurs candidats, le plus proche dans le temps
 * l'emporte.
 */
const MATCHERS: Matcher[] = [sameExternalId, sameUrlAndDay, sameNameAndDay, sameUrl, sameSlotAndGame];

function closest(incoming: SourceEvent, candidates: StoredEvent[]): StoredEvent {
  const target = startMillis(incoming.startDateTime) ?? 0;

  return candidates.reduce((best, candidate) => {
    const bestDistance = Math.abs((startMillis(best.startDateTime) ?? Number.MAX_SAFE_INTEGER) - target);
    const distance = Math.abs((startMillis(candidate.startDateTime) ?? Number.MAX_SAFE_INTEGER) - target);
    return distance < bestDistance ? candidate : best;
  });
}

function patchFor(incoming: SourceEvent): SourceEventPatch {
  return {
    name: incoming.name,
    startDateTime: incoming.startDateTime,
    endDateTime: incoming.endDateTime,
    gameName: incoming.gameName,
    price: incoming.price,
    status: incoming.status,
    url: incoming.url,
    source: { url: incoming.sourceUrl, externalId: incoming.externalId },
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return (left ?? undefined) === (right ?? undefined);
}

function hasChanges(existing: StoredEvent, patch: SourceEventPatch): boolean {
  return (
    !sameValue(existing.name, patch.name) ||
    !sameValue(startMillis(existing.startDateTime), startMillis(patch.startDateTime)) ||
    !sameValue(startMillis(existing.endDateTime), startMillis(patch.endDateTime)) ||
    !sameValue(existing.gameName, patch.gameName) ||
    !sameValue(existing.price, patch.price) ||
    !sameValue(existing.status, patch.status) ||
    !sameValue(existing.url, patch.url) ||
    !sameValue(existing.source?.url, patch.source?.url) ||
    !sameValue(existing.source?.externalId, patch.source?.externalId)
  );
}

/**
 * Confronte ce qu'une relecture des sources a rendu à ce que la base tient.
 *
 * `existing` est **tout** ce que le lieu a d'automatisé, passé compris : un
 * événement passé qu'une page annonce encore doit être reconnu, pas réinséré.
 * Mais seul ce qui n'a **pas commencé** peut être retiré ou annulé. Les
 * événements saisis à la main sont ignorés quoi qu'il arrive.
 *
 * `failedSourceUrls` dit quelles sources n'ont pas pu être relues. Leurs
 * événements sont laissés tels quels : une page en panne n'annule pas ce
 * qu'elle annonçait hier. Un événement d'avant cette version, qui ne sait pas
 * de quelle source il vient, n'est retiré que si **toutes** les sources ont
 * répondu.
 *
 * Un événement disparu de sa source mais suivi par quelqu'un — un favori, une
 * inscription — est **annulé**, pas retiré : s'il revient au tour suivant, il
 * est reconnu et reprend son statut ; s'il est bien annulé, la personne le
 * voit barré plutôt que de le chercher en vain.
 */
export function reconcileSourceEvents({
  incoming,
  existing,
  now,
  failedSourceUrls = [],
}: {
  incoming: SourceEvent[];
  existing: StoredEvent[];
  now: DateTime;
  failedSourceUrls?: string[];
}): Reconciliation {
  const failed = new Set(failedSourceUrls);
  const pool = new Set(existing.filter(isAutomated));
  const matches = new Map<SourceEvent, StoredEvent>();

  for (const matcher of MATCHERS) {
    for (const event of incoming) {
      if (matches.has(event)) continue;

      const candidates = [...pool].filter((candidate) => matcher(event, candidate, now));
      if (candidates.length === 0) continue;

      const match = closest(event, candidates);
      matches.set(event, match);
      pool.delete(match);
    }
  }

  const result: Reconciliation = { toInsert: [], toUpdate: [], unchanged: [], toCancel: [], toDelete: [] };

  for (const event of incoming) {
    const match = matches.get(event);
    if (!match) {
      result.toInsert.push(event);
      continue;
    }

    const patch = patchFor(event);
    if (hasChanges(match, patch)) {
      result.toUpdate.push({ existing: match, patch });
    } else {
      result.unchanged.push(match);
    }
  }

  for (const orphan of pool) {
    if (!hasNotStarted(orphan, now)) continue;

    const sourceUrl = orphan.source?.url;
    const sourceWasRead = sourceUrl ? !failed.has(sourceUrl) : failed.size === 0;
    if (!sourceWasRead) continue;

    if (isFollowed(orphan)) {
      if (orphan.status !== "cancelled") result.toCancel.push(orphan);
    } else {
      result.toDelete.push(orphan);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lecture d'un JSON
// ---------------------------------------------------------------------------

/**
 * Lit une valeur à un chemin : `data.events`, `results[0].name`,
 * `items.0.title`. Un chemin vide, `$` ou `.` désigne la racine.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "$" || trimmed === ".") return obj;

  const segments = trimmed
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((segment) => segment !== "");

  return segments.reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number.parseInt(key, 10);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Le tableau d'événements d'un JSON, quelle que soit sa forme : un tableau,
 * ou un objet indexé par identifiant — `{ "42": {…}, "43": {…} }` —, forme
 * courante des exports de billetterie.
 */
export function readEventsCollection(data: unknown, path: string): unknown[] | null {
  const value = getNestedValue(data, path);

  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    if (values.length > 0 && values.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return values;
    }
  }

  return null;
}
