import type { ContributionKind } from "@/lib/contributions/feed.ts";
import type { ReportableContentType } from "@/lib/types/Report.ts";

/**
 * Les couleurs des étiquettes de type, par famille, communes à l'accueil, aux
 * signalements et au centre des contributions : une même famille garde une
 * même couleur d'un écran à l'autre. Les familles se distinguent aussi par la
 * clarté, pas seulement par la teinte.
 */
const FAMILY_TONES = {
  contenus: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100",
  regles: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  jeu: "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100",
  orga: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
  groupes: "bg-orange-100 text-orange-950 dark:bg-orange-500/20 dark:text-orange-100",
  lieux: "bg-slate-200 text-slate-900 dark:bg-slate-500/25 dark:text-slate-100",
} as const;

type Family = keyof typeof FAMILY_TONES;

const CONTRIBUTION_FAMILIES: Record<ContributionKind, Family> = {
  "user-content": "contenus",
  news: "contenus",
  quiz: "contenus",
  errata: "regles",
  policy: "regles",
  deck: "jeu",
  wishlist: "jeu",
  event: "orga",
  tournament: "orga",
  league: "orga",
  lair: "lieux",
  "play-group": "groupes",
  "play-group-content": "groupes",
  "play-group-announcement": "groupes",
};

const REPORT_FAMILIES: Record<ReportableContentType, Family> = {
  "user-content": "contenus",
  news: "contenus",
  quiz: "contenus",
  errata: "regles",
  policy: "regles",
  deck: "jeu",
  wishlist: "jeu",
  "sell-list": "jeu",
  event: "orga",
  tournament: "orga",
  league: "orga",
  lair: "lieux",
  user: "lieux",
  "play-group": "groupes",
};

export function contributionTone(kind: ContributionKind): string {
  return FAMILY_TONES[CONTRIBUTION_FAMILIES[kind]];
}

export function reportTone(type: ReportableContentType): string {
  return FAMILY_TONES[REPORT_FAMILIES[type]];
}
