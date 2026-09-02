import { DateTime } from "luxon";
import { parse, type HTMLElement } from "node-html-parser";
import type { EventHtmlConfig, EventSource, HtmlFieldRule } from "@/lib/types/Lair";
import type { Game } from "@/lib/types/Game";
import {
  canonicalGameName,
  EVENTS_TIMEZONE,
  findGameInText,
  inferStatusFromText,
  normalizeEventName,
  normalizeEventPrice,
  normalizeEventStatus,
  resolveEventDates,
  resolveEventUrl,
  resolveEventYear,
  type SourceEvent,
} from "./source-events";

/**
 * Une source HTML : une page lue par sélecteurs CSS, sans modèle.
 *
 * C'est le pendant de la correspondance JSON pour une page de boutique : un
 * sélecteur désigne chaque événement, puis un sélecteur par champ dit où
 * lire sa valeur — le texte de l'élément, ou l'un de ses attributs. Ce que
 * la page ne donne pas champ par champ mais dans un **titre composé** —
 * « Riftbound - Tournois Nexus - 03/09/2026 - 19h30 » — se lit depuis ce
 * titre : la date et l'heure par leur motif, le jeu comme premier segment,
 * le nom comme ce qui reste.
 *
 * Tout est pur et testable sur un extrait de page : `refresh-events` ne fait
 * que télécharger et appeler `extractHtmlEvents`.
 */

/** Les champs qu'une règle HTML peut renseigner, dans l'ordre du formulaire. */
export const HTML_FIELDS = [
  "id",
  "title",
  "name",
  "gameName",
  "date",
  "time",
  "startDateTime",
  "endDateTime",
  "price",
  "status",
  "url",
  "venue",
] as const;

export type HtmlField = (typeof HTML_FIELDS)[number];

export const DEFAULT_TITLE_SEPARATOR = " - ";

export type HtmlExtraction = {
  /** Le nombre d'éléments que le sélecteur a désignés, événements ignorés compris. */
  itemCount: number;
  events: SourceEvent[];
  warnings: string[];
  /** Combien d'éléments portent chaque ville, filtre compris : ce que le test propose à cocher. */
  venueCounts: Record<string, number>;
};

/** Le mot qu'un champ de formulaire remplace par chaque ville à inclure. */
export const VENUE_PLACEHOLDER = "{ville}";

/** Un champ de formulaire attend-il une ville ? */
export function hasVenuePlaceholder(formFields: Record<string, string> | undefined): boolean {
  return Object.values(formFields ?? {}).some((value) => value.includes(VENUE_PLACEHOLDER));
}

/** Les champs de formulaire pour une ville donnée. */
export function formFieldsForVenue(formFields: Record<string, string>, venue: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(formFields).map(([key, value]) => [key, value.split(VENUE_PLACEHOLDER).join(venue)]),
  );
}

/**
 * Les villes qu'une page sait servir, lues où la configuration le dit — les
 * `<option>` d'un formulaire, le plus souvent. Le texte de chaque élément,
 * sans doublon, dans l'ordre de la page.
 */
export function readVenueOptions(html: string, selector: string | undefined): string[] {
  if (!selector?.trim()) return [];

  const seen = new Set<string>();
  const venues: string[] = [];

  for (const element of parse(html).querySelectorAll(selector.trim())) {
    const text = element.text.replace(/\s+/g, " ").trim();
    const key = normalizeEventName(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    venues.push(text);
  }

  return venues;
}

const FRENCH_MONTHS = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
];

/** « 03/09/2026 », « 25/09/26 », « 3.9.2026 ». */
const NUMERIC_DATE = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/;

/** « 15 mars 2026 », « 1er mars », « samedi 15 mars ». */
const FRENCH_DATE =
  /\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+(\d{4}))?\b/i;

/** « 19h30 », « 14h », « 10:30 », « 19 h 30 ». */
const TIME = /\b(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?\b/;

export type DayOfYear = { day: number; month: number; year?: number };
export type TimeOfDay = { hour: number; minute: number };

export type CompositeTitle = {
  game?: string;
  name: string;
  /** Les segments du titre, date et heure retirées, dans l'ordre. */
  segments: string[];
  date?: DayOfYear;
  time?: TimeOfDay;
};

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Découpe un titre composé.
 *
 * La date et l'heure sont reconnues à leur motif, où qu'elles soient — une
 * boutique met l'heure avant la date sur un événement et après sur le
 * suivant. Ce qui reste est coupé au séparateur : le premier segment est le
 * jeu, le reste le nom. Un titre sans séparateur est tout entier un nom.
 */
export function parseCompositeTitle(title: string, separator: string = DEFAULT_TITLE_SEPARATOR): CompositeTitle {
  const { date, rest: withoutDate } = takeDate(title.replace(/\s+/g, " ").trim());
  const { time, rest } = takeTime(withoutDate);

  // Retirer la date et l'heure laisse des séparateurs orphelins (« Nexus -  - ») :
  // un segment sans lettre ni chiffre n'est pas un segment.
  const segments = rest
    .split(separatorPattern(separator))
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => /[\p{L}\p{N}]/u.test(segment));

  if (segments.length >= 2) {
    return { game: segments[0], name: segments.slice(1).join(separator), segments, date, time };
  }

  return { name: segments[0] ?? "", segments, date, time };
}

/** Retire la première date d'un texte, et la rend. */
function takeDate(text: string): { date?: DayOfYear; rest: string } {
  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) {
    const year = Number.parseInt(numeric[3], 10);
    return {
      date: {
        day: Number.parseInt(numeric[1], 10),
        month: Number.parseInt(numeric[2], 10),
        year: numeric[3].length === 2 ? 2000 + year : year,
      },
      rest: text.replace(numeric[0], " "),
    };
  }

  const french = FRENCH_DATE.exec(text);
  if (french) {
    return {
      date: {
        day: Number.parseInt(french[1], 10),
        month: FRENCH_MONTHS.indexOf(stripAccents(french[2]).toLowerCase()) + 1,
        ...(french[3] ? { year: Number.parseInt(french[3], 10) } : {}),
      },
      rest: text.replace(french[0], " "),
    };
  }

  return { rest: text };
}

/** Retire la première heure d'un texte, et la rend. */
function takeTime(text: string): { time?: TimeOfDay; rest: string } {
  const hour = TIME.exec(text);
  if (!hour) return { rest: text };

  return {
    time: { hour: Number.parseInt(hour[1], 10), minute: hour[2] ? Number.parseInt(hour[2], 10) : 0 },
    rest: text.replace(hour[0], " "),
  };
}

/** « mercredi 02 septembre », « 03/09/2026 » : une date seule. */
export function parseDateText(text: string): DayOfYear | undefined {
  return takeDate(text.replace(/\s+/g, " ").trim()).date;
}

/**
 * « 19h30 », « 13:30 - 18:30 », « 13:30:00 - 18:30:00 » : une heure, ou une
 * plage. La seconde heure, s'il y en a une, est la fin.
 */
export function parseTimeRange(text: string): { start: TimeOfDay; end?: TimeOfDay } | undefined {
  const first = takeTime(text.replace(/\s+/g, " ").trim());
  if (!first.time) return undefined;

  // « 13:30:00 » laisse « :00 » derrière la première heure : on l'écarte
  // avant de chercher la fin, sinon il passerait pour « 00 h ».
  const second = takeTime(first.rest.replace(/^\s*:\d{2}/, " "));

  return { start: first.time, ...(second.time ? { end: second.time } : {}) };
}

/**
 * Le motif qui coupe un titre à son séparateur.
 *
 * Un tiret ne compte que **entouré d'espaces** : « Avant-Première » est un
 * mot, pas deux segments. Et un tiret vaut pour ses cousins typographiques —
 * une boutique écrit « Cyberpunk TCG – Beta Event » avec un tiret demi-cadratin
 * là où le titre suivant a un trait d'union.
 */
function separatorPattern(separator: string): RegExp {
  const trimmed = separator.trim();
  if (trimmed === "" || /^[-–—]$/.test(trimmed)) {
    return /\s+[-–—]\s+/;
  }
  return new RegExp(`\\s*${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`);
}

/**
 * Lit un champ sur un élément : le texte de l'élément visé, ou un attribut.
 * Un sélecteur vide vise l'élément de l'événement lui-même.
 */
export function readHtmlField(item: HTMLElement, rule: HtmlFieldRule | undefined): string | undefined {
  if (!rule) return undefined;

  const selector = rule.selector?.trim();
  const target = selector ? item.querySelector(selector) : item;
  if (!target) return undefined;

  const attribute = rule.attribute?.trim();
  const raw = attribute ? target.getAttribute(attribute) : target.text;
  const value = raw?.replace(/\s+/g, " ").trim();

  return value || undefined;
}

/**
 * Lit tous les événements d'une page.
 *
 * Un sélecteur d'événements qui ne désigne **rien** est rendu comme tel
 * (`itemCount: 0`) : à l'appelant de décider que c'est une panne — une mise
 * en page qui a changé est bien plus probable qu'un agenda vide, et une panne
 * ne retire rien.
 */
export function extractHtmlEvents({
  html,
  config,
  source,
  games,
  now,
  venues = config.venues ?? [],
}: {
  html: string;
  config: EventHtmlConfig;
  source: Pick<EventSource, "url" | "gameAliases">;
  games: Pick<Game, "name">[];
  now: DateTime;
  /** Les villes à garder pour cette page — celles de la configuration par défaut. */
  venues?: string[];
}): HtmlExtraction {
  const root = parse(html);
  const items = root.querySelectorAll(config.itemSelector);
  const separator = config.titleSeparator || DEFAULT_TITLE_SEPARATOR;
  const fields = config.fields ?? {};

  const counts = new Map<string, number>();
  const warn = (message: string) => counts.set(message, (counts.get(message) ?? 0) + 1);
  const events: SourceEvent[] = [];
  const venueCounts: Record<string, number> = {};

  // Le filtre ne vaut que si la page dit la ville de chaque événement : sans
  // champ `venue`, on garde tout, et c'est le formulaire du site qui filtre.
  const wanted = fields.venue ? new Set(venues.map(normalizeEventName).filter(Boolean)) : new Set<string>();
  let skippedVenues = 0;

  for (const item of items) {
    const venue = readHtmlField(item, fields.venue);
    if (venue) {
      venueCounts[venue] = (venueCounts[venue] ?? 0) + 1;
    }

    if (wanted.size > 0 && (!venue || !wanted.has(normalizeEventName(venue)))) {
      skippedVenues += 1;
      continue;
    }

    const rawTitle = readHtmlField(item, fields.title);
    const title = rawTitle ? parseCompositeTitle(rawTitle, separator) : null;
    const explicitGame = readHtmlField(item, fields.gameName);

    const name = readHtmlField(item, fields.name) ?? (title ? titleName(title, explicitGame, games, source.gameAliases, separator) : undefined);
    if (!name) {
      warn("événement sans nom, ignoré");
      continue;
    }

    const dates = resolveStartAndEnd({ item, fields, title, now });
    if (!dates) {
      warn(`date de début illisible pour « ${name} », événement ignoré`);
      continue;
    }

    const { gameName, warning } = resolveGame({
      explicit: explicitGame,
      title: rawTitle,
      titleGame: title?.game,
      games,
      aliases: source.gameAliases,
    });
    if (warning) warn(warning);

    const rawStatus = readHtmlField(item, fields.status);
    let status = rawStatus ? normalizeEventStatus(rawStatus) ?? inferStatusFromText(rawStatus) : null;
    if (!status) {
      if (rawStatus) warn(`statut « ${rawStatus} » inconnu, lu comme « available »`);
      status = "available";
    }

    const externalId = readHtmlField(item, fields.id);

    events.push({
      name,
      ...dates,
      gameName,
      price: normalizeEventPrice(readHtmlField(item, fields.price)),
      status,
      url: resolveEventUrl(readHtmlField(item, fields.url), source.url),
      addedBy: "HTML-SCRAPPING",
      sourceUrl: source.url,
      ...(externalId ? { externalId } : {}),
    });
  }

  if (wanted.size > 0 && items.length > 0 && skippedVenues === items.length) {
    warn(`aucun événement dans les villes choisies (${venues.join(", ")}) : vérifiez le champ venue et l'orthographe`);
  }

  return {
    itemCount: items.length,
    events,
    warnings: [...counts.entries()].map(([message, count]) => (count > 1 ? `${count} × ${message}` : message)),
    venueCounts,
  };
}

/**
 * Le nom que donne un titre composé.
 *
 * Sans jeu à part, le premier segment est le jeu et le reste le nom. Avec un
 * jeu lu ailleurs sur la page, le titre est tout entier un nom — « Tournoi de
 * Lancement - Chapitre 14 » n'est pas un jeu suivi d'un nom —, sauf si son
 * premier segment répète ce jeu : « POKEMON - Avant-Première Règne Delta »
 * donne « Avant-Première Règne Delta ».
 */
function titleName(
  title: CompositeTitle,
  explicitGame: string | undefined,
  games: Pick<Game, "name">[],
  aliases: Record<string, string> | undefined,
  separator: string,
): string {
  if (!explicitGame) return title.name;

  const [first, ...others] = title.segments;
  if (others.length === 0) return title.name;

  const game = canonicalGameName(explicitGame, games, aliases) ?? explicitGame;
  const firstGame = canonicalGameName(first, games, aliases) ?? findGameInText(first, games, aliases);
  const repeatsGame =
    normalizeEventName(first) === normalizeEventName(explicitGame) ||
    (firstGame !== null && normalizeEventName(firstGame) === normalizeEventName(game));

  return repeatsGame ? others.join(separator) : title.segments.join(separator);
}

/**
 * Les bornes d'un événement, dans l'ordre de ce que la page donne :
 *
 * 1. un début complet (`startDateTime`) ;
 * 2. une date et une heure à part (`date`, `time`) — la plage « 13:30 -
 *    18:30 » donne aussi la fin ;
 * 3. la date et l'heure du titre composé.
 *
 * Une date sans année prend celle qu'un agenda suggère ; sans heure, elle
 * commence à minuit.
 */
function resolveStartAndEnd({
  item,
  fields,
  title,
  now,
}: {
  item: HTMLElement;
  fields: NonNullable<EventHtmlConfig["fields"]>;
  title: CompositeTitle | null;
  now: DateTime;
}): { startDateTime: string; endDateTime: string } | null {
  const explicitStart = readHtmlField(item, fields.startDateTime);
  const explicitEnd = readHtmlField(item, fields.endDateTime);

  if (explicitStart) {
    return resolveEventDates({ start: explicitStart, end: explicitEnd, now, trustYear: true });
  }

  const dateText = readHtmlField(item, fields.date);
  const timeText = readHtmlField(item, fields.time);
  const range = timeText ? parseTimeRange(timeText) : undefined;

  const date = (dateText ? parseDateText(dateText) : undefined) ?? title?.date;
  const time = range?.start ?? title?.time;
  if (!date) return null;

  const start = dayAt(date, time, now);
  if (!start) return null;

  const end = explicitEnd ?? (range?.end ? dayAt(date, range.end, now)?.toISO() : undefined);

  return resolveEventDates({ start: start.toISO(), end, now, trustYear: true });
}

/** Une date et une heure, dans l'année qu'un agenda suggère si elle manque. */
function dayAt(date: DayOfYear, time: TimeOfDay | undefined, now: DateTime): DateTime | null {
  const guessed = DateTime.fromObject(
    { year: date.year ?? now.year, month: date.month, day: date.day, hour: time?.hour ?? 0, minute: time?.minute ?? 0 },
    { zone: EVENTS_TIMEZONE },
  );
  if (!guessed.isValid) return null;

  return resolveEventYear(guessed, now, { trustYear: date.year !== undefined });
}


/**
 * Le jeu d'un événement, dans l'ordre de confiance :
 *
 * 1. un champ dédié de la page ;
 * 2. le premier segment du titre, s'il est un jeu connu (ou un alias) ;
 * 3. un jeu connu mentionné **dans** le titre — « Avant Premiere MTG Réalité
 *    Fracturée » n'a pas de segment de jeu, mais dit bien de quoi il parle ;
 * 4. le premier segment tel quel, avec un avertissement : la plateforme ne
 *    le connaît pas, un alias ou un nouveau jeu le réglera.
 *
 * Jamais une chaîne vide : la jointure des agendas est exacte.
 */
function resolveGame({
  explicit,
  title,
  titleGame,
  games,
  aliases,
}: {
  explicit: string | undefined;
  title: string | undefined;
  titleGame: string | undefined;
  games: Pick<Game, "name">[];
  aliases: Record<string, string> | undefined;
}): { gameName: string; warning?: string } {
  if (explicit) {
    const canonical = canonicalGameName(explicit, games, aliases) ?? findGameInText(explicit, games, aliases);
    return canonical
      ? { gameName: canonical }
      : { gameName: explicit, warning: `jeu inconnu de la plateforme : « ${explicit} »` };
  }

  if (titleGame) {
    const canonical = canonicalGameName(titleGame, games, aliases);
    if (canonical) return { gameName: canonical };
  }

  const inTitle = title ? findGameInText(title, games, aliases) : null;
  if (inTitle) return { gameName: inTitle };

  if (titleGame) {
    return { gameName: titleGame, warning: `jeu inconnu de la plateforme : « ${titleGame} »` };
  }

  return { gameName: "Jeu non spécifié", warning: `jeu absent pour « ${title ?? "?"} », « Jeu non spécifié » écrit à la place` };
}
