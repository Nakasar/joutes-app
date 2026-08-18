import { DateTime } from "luxon";

/**
 * Mise en forme de la timeline d'une ligue.
 *
 * Module pur : le regroupement par année et les libellés se testent sans base,
 * et c'est là que se logent les erreurs qu'on ne voit pas à l'œil — un ordinal
 * français, un bilan vide affiché « 0V/0N/0D », un tournoi rangé sous la
 * mauvaise année parce qu'il tombe le 31 décembre.
 */

export type TimelinePlayer = {
  userId?: string;
  /** Déjà mis en forme : « Pseudo#1234 ». */
  label: string;
  avatar?: string;
  /** Repli quand le joueur n'a pas d'image de profil. */
  initials: string;
};

export type TimelinePodiumEntry = TimelinePlayer & {
  rank: number;
  rankLabel: string;
  record: string;
  points: number;
};

export type TimelineEntry = {
  tournamentId: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  /** Date ISO : la mise en forme lisible revient au composant. */
  date: string;
  year: string;
  gameName?: string;
  playersCount: number;
  /** Points que ce tournoi a apportés à la ligue. 0 tant qu'il n'est pas clos. */
  points: number;
  winner: TimelinePlayer | null;
  podium: TimelinePodiumEntry[];
  feats: { title: string; playerLabel: string }[];
};

export type TimelineYearGroup = {
  year: string;
  entries: TimelineEntry[];
};

export type TimelineUser = {
  id?: string;
  username?: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
};

/**
 * « Pseudo#1234 », comme partout ailleurs dans les ligues : le nom affiché
 * s'il existe, le pseudonyme de compte sinon, et le discriminant seulement
 * quand il est connu.
 */
export function playerLabel(user: TimelineUser | null | undefined, fallback = "Joueur inconnu"): string {
  if (!user) return fallback;
  const name = user.displayName || user.username;
  if (!name) return fallback;
  return user.discriminator ? `${name}#${user.discriminator}` : name;
}

/** Deux premières lettres du nom affiché, pour l'avatar de repli. */
export function playerInitials(user: TimelineUser | null | undefined): string {
  const name = user?.displayName || user?.username || "";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}

/** « 1er », « 2e », « 3e »… La première place est le seul ordinal irrégulier. */
export function rankLabel(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

/**
 * Bilan compact « 3V/1N/1D ». Les colonnes à zéro sont omises : un joueur qui
 * n'a jamais fait nul n'a pas à lire « 0N ». Un bilan entièrement vide rend
 * une chaîne vide plutôt qu'un assemblage de zéros.
 */
export function formatRecord(record: { wins: number; draws: number; losses: number }): string {
  const parts: string[] = [];
  if (record.wins > 0) parts.push(`${record.wins}V`);
  if (record.draws > 0) parts.push(`${record.draws}N`);
  if (record.losses > 0) parts.push(`${record.losses}D`);
  return parts.join("/");
}

/**
 * Regroupe les entrées par année, en conservant leur ordre. L'année est lue
 * dans le fuseau de l'application (Europe/Paris) : un tournoi du 31 décembre au
 * soir appartient à l'année où il s'est joué, pas à celle d'UTC.
 */
export function groupByYear(entries: TimelineEntry[]): TimelineYearGroup[] {
  const groups: TimelineYearGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.year === entry.year) last.entries.push(entry);
    else groups.push({ year: entry.year, entries: [entry] });
  }
  return groups;
}

/** Année d'une date, dans le fuseau de l'application. */
export function yearOf(date: Date): string {
  return String(DateTime.fromJSDate(date).setZone("Europe/Paris").year);
}

/**
 * Ordre de la timeline : du plus récent au plus ancien, ce que raconte une
 * saison qu'on remonte. À date égale, le nom départage — sans quoi deux
 * tournois du même jour changeraient de place d'un rendu à l'autre.
 */
export function sortNewestFirst<T extends { date: string; name: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const diff = DateTime.fromISO(b.date).toMillis() - DateTime.fromISO(a.date).toMillis();
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "fr");
  });
}
