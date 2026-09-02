import type { DateTime } from "luxon";
import type { EventSource } from "@/lib/types/Lair";
import { HTML_PRESETS, type HtmlPreset } from "./html-presets";
import { canonicalGameName, normalizeEventName, type SourceEvent } from "./source-events";

/**
 * Le mot qu'un champ de formulaire porte pour être demandé ville par ville —
 * le même que `VENUE_PLACEHOLDER` de `html-source`, redit ici pour que ce
 * module, que l'écran du gérant embarque, n'entraîne pas l'analyseur HTML
 * dans le navigateur.
 */
const VENUE_PLACEHOLDER = "{ville}";

function hasVenuePlaceholder(formFields: Record<string, string> | undefined): boolean {
  return Object.values(formFields ?? {}).some((value) => value.includes(VENUE_PLACEHOLDER));
}

/**
 * La connexion d'un site par son gérant.
 *
 * Un gérant de boutique ne configure pas de sélecteurs : il colle l'adresse
 * de la page de ses événements, et Joutes la reconnaît — ou non — à son
 * domaine, parmi les préréglages. Tout ce qui se décide sans la base est
 * ici : reconnaître la page, bâtir la source qu'elle donne, résumer les jeux
 * qu'elle rend, et dire si un lieu est à relire aujourd'hui.
 */

/** Le rythme auquel Joutes relit le site d'un lieu. */
export type RefreshFrequency = "weekly" | "daily";

export const DEFAULT_REFRESH_FREQUENCY: RefreshFrequency = "weekly";

/** Le jour de la lecture hebdomadaire : le mercredi (numérotation ISO de luxon). */
export const WEEKLY_REFRESH_WEEKDAY = 3;

/** Ce que le gérant choisit ; le reste vient du préréglage. */
export type ManagerSourceInput = {
  url: string;
  presetKey: string;
  venues?: string[];
  gameAliases?: Record<string, string>;
};

/** Le préréglage qui sait lire cette adresse, à son domaine. */
export function findPresetForUrl(url: string): HtmlPreset | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  return (
    HTML_PRESETS.find((preset) =>
      preset.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
    ) ?? null
  );
}

export function findPresetByKey(key: string): HtmlPreset | null {
  return HTML_PRESETS.find((preset) => preset.key === key) ?? null;
}

/**
 * Ce préréglage demande-t-il de choisir des villes ?
 *
 * Oui quand la page lit une ville par événement, ou quand son formulaire
 * attend `{ville}` : dans les deux cas, sans ville cochée, le lieu recevrait
 * les événements de toutes les boutiques du site, ou aucun.
 */
export function presetAsksVenues(preset: HtmlPreset): boolean {
  return Boolean(preset.config.fields.venue) || hasVenuePlaceholder(preset.formFields);
}

/** Ce que le gérant voit d'un préréglage : de quoi dire « nous connaissons ce site ». */
export type RecognizedSite = {
  key: string;
  label: string;
  asksVenues: boolean;
};

export function describePreset(preset: HtmlPreset): RecognizedSite {
  return { key: preset.key, label: preset.label, asksVenues: presetAsksVenues(preset) };
}

/** Le motif de l'avertissement qu'une lecture émet pour un jeu qu'elle ne reconnaît pas. */
const UNKNOWN_GAME_WARNING = /^jeu inconnu de la plateforme : « (.+) »$/;

/**
 * Les jeux que le dernier rapport dit ne pas connaître : c'est ce que le
 * gérant a à régler, et l'écran connecté le lui montre sans relire le site.
 */
export function unknownGamesFromWarnings(warnings: string[]): string[] {
  const names = new Set<string>();
  for (const warning of warnings) {
    const match = UNKNOWN_GAME_WARNING.exec(warning);
    if (match) names.add(match[1]);
  }
  return [...names];
}

/**
 * Les villes à cocher d'office : celles dont le nom apparaît dans l'adresse
 * du lieu sur Joutes. Une boutique de Thionville voit Thionville cochée sans
 * avoir à la chercher dans la liste.
 */
export function venuesMatchingAddress(available: string[], address: string | undefined): string[] {
  if (!address) return [];
  const haystack = normalizeEventName(address);
  return available.filter((venue) => {
    const needle = normalizeEventName(venue);
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * La source d'un gérant : le préréglage, avec ses villes et ses alias.
 *
 * `managedBy: "owner"` la distingue de celles que l'équipe configure depuis
 * l'administration : le gérant ne voit et ne touche que la sienne.
 */
export function buildManagerSource(input: ManagerSourceInput, preset: HtmlPreset): EventSource {
  const venues = (input.venues ?? []).map((venue) => venue.trim()).filter(Boolean);
  const aliases = Object.fromEntries(
    Object.entries(input.gameAliases ?? {})
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value),
  );

  return {
    url: input.url,
    type: "HTML",
    htmlConfig: {
      ...preset.config,
      ...(venues.length > 0 ? { venues } : {}),
    },
    ...(preset.formFields ? { formFields: preset.formFields } : {}),
    ...(Object.keys(aliases).length > 0 ? { gameAliases: aliases } : {}),
    managedBy: "owner",
  };
}

/** La source qu'un gérant a connectée, s'il y en a une. */
export function findManagerSource(sources: EventSource[] | undefined): EventSource | null {
  return sources?.find((source) => source.managedBy === "owner") ?? null;
}

export type GameSummary = {
  /** Le nom tel que le site le donne, ou tel que la plateforme le connaît s'il est reconnu. */
  name: string;
  /** Le nom sur la plateforme, `null` si elle ne le connaît pas. */
  canonical: string | null;
  count: number;
};

/**
 * Les jeux qu'une lecture a rendus, avec le nombre d'événements de chacun,
 * les inconnus en tête : c'est ce que le gérant a à régler.
 */
export function summarizeGames(
  events: Pick<SourceEvent, "gameName">[],
  games: { name: string }[],
  aliases: Record<string, string> = {},
): GameSummary[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.gameName, (counts.get(event.gameName) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, canonical: canonicalGameName(name, games, aliases), count }))
    .sort((left, right) => {
      if ((left.canonical === null) !== (right.canonical === null)) {
        return left.canonical === null ? -1 : 1;
      }
      return right.count - left.count || left.name.localeCompare(right.name);
    });
}

/**
 * Ce lieu est-il à relire aujourd'hui ?
 *
 * Le cron passe chaque matin ; la lecture quotidienne est réservée aux lieux
 * Pro — un lieu qui l'a choisie puis a perdu son Pro retombe sur la lecture
 * hebdomadaire sans rien à réécrire —, les autres sont lus le mercredi.
 */
export function isRefreshDue({
  frequency,
  pro,
  now,
}: {
  frequency: RefreshFrequency | undefined;
  pro: boolean;
  now: DateTime;
}): boolean {
  if (frequency === "daily" && pro) return true;
  return now.weekday === WEEKLY_REFRESH_WEEKDAY;
}

/** L'heure à laquelle le cron passe, en heure de Paris. */
export const REFRESH_HOUR = 8;

/**
 * La prochaine lecture d'un lieu : demain matin pour un lieu Pro relu chaque
 * jour, le prochain mercredi matin sinon — aujourd'hui compris si le cron
 * n'est pas encore passé.
 */
export function nextRefreshAt({
  frequency,
  pro,
  now,
}: {
  frequency: RefreshFrequency | undefined;
  pro: boolean;
  now: DateTime;
}): DateTime {
  const thisMorning = now.set({ hour: REFRESH_HOUR, minute: 0, second: 0, millisecond: 0 });
  if (frequency === "daily" && pro) {
    return now < thisMorning ? thisMorning : thisMorning.plus({ days: 1 });
  }

  let candidate = thisMorning.plus({ days: (WEEKLY_REFRESH_WEEKDAY - now.weekday + 7) % 7 });
  if (candidate <= now) candidate = candidate.plus({ weeks: 1 });
  return candidate;
}
