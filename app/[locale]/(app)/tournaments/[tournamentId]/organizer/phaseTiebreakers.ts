import {
  DEFAULT_TIEBREAKERS,
  GENERIC_TIEBREAKERS,
  type TournamentTiebreaker,
} from "@/lib/types/Tournament.ts";

/**
 * Départages côté configuration : la même résolution que le serveur applique au
 * classement (lib/tournaments/game-presets.ts), mais à partir des presets tels
 * que la page les transmet. L'organisateur doit lire à l'écran exactement la
 * chaîne qui sera appliquée — sinon autant ne rien afficher.
 *
 * Rien n'est importé du catalogue des presets : la page transmet déjà par
 * props les seuls presets utiles, et le bundle client n'a pas à embarquer les
 * réglages de tous les jeux pour afficher une liste de critères.
 */

// Preset de format proposé par le jeu du tournoi, résolu côté serveur.
export type PhasePresetOption = {
  key: string;
  labelKey: string;
  // Saisie des statistiques exigée par l'usage du jeu, proposée à la sélection
  // du preset. L'organisateur reste libre de la décocher.
  requireStats: boolean;
  // Statistiques relevées par le preset : elles servent de départages, et leur
  // libellé se lit sous `matchStats.stats.<labelKey>`.
  stats: { key: string; labelKey: string }[];
  // Départages officiels du jeu, proposés d'emblée à la phase qui prend ce preset.
  tiebreakers: TournamentTiebreaker[];
};

/** Départages officiels du preset, ou la chaîne historique en son absence. */
export function officialTiebreakers(preset?: PhasePresetOption): TournamentTiebreaker[] {
  return preset?.tiebreakers ?? DEFAULT_TIEBREAKERS;
}

/**
 * Critères calculables avec ce preset : ses statistiques, puis ceux qui ne
 * dépendent d'aucun jeu. La plateforme ne sait rien départager d'autre.
 */
export function availableTiebreakers(preset?: PhasePresetOption): TournamentTiebreaker[] {
  return [
    ...(preset?.stats ?? []).map((stat) => `stat:${stat.key}` as TournamentTiebreaker),
    ...GENERIC_TIEBREAKERS,
  ];
}

/**
 * Chaîne effectivement appliquée à une phase : celle qu'elle porte, sinon celle
 * du jeu. Les critères devenus incalculables (statistique d'un preset retiré
 * depuis) sont écartés, comme le fait le calcul du classement.
 */
export function effectiveTiebreakers(
  chosen: TournamentTiebreaker[] | undefined,
  preset?: PhasePresetOption
): TournamentTiebreaker[] {
  if (!chosen) return officialTiebreakers(preset);
  const applicable = new Set<string>(availableTiebreakers(preset));
  return chosen.filter((key) => applicable.has(key));
}

/** Deux chaînes identiques : mêmes critères, même ordre. */
export function sameTiebreakers(a: TournamentTiebreaker[], b: TournamentTiebreaker[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * Libellé d'un critère : celui de la statistique quand il en désigne une, le
 * nom du critère générique sinon. La clé brute sert de dernier recours pour une
 * statistique que le preset ne déclare plus.
 */
export function tiebreakerLabel(
  key: TournamentTiebreaker,
  preset: PhasePresetOption | undefined,
  t: (key: string) => string
): string {
  if (!key.startsWith("stat:")) return t(`organizerPhases.tiebreakerNames.${key}`);
  const statKey = key.slice("stat:".length);
  const stat = preset?.stats.find((candidate) => candidate.key === statKey);
  return stat ? t(`matchStats.stats.${stat.labelKey}`) : statKey;
}

/**
 * Ce dont part une nouvelle phase de ce tournoi : les réglages du jeu, tels que
 * l'administration les a posés (`lib/tournaments/game-defaults.ts`), résolus
 * côté serveur et transmis tels quels au formulaire.
 */
export type PhaseGameDefaults = {
  // Preset appliqué d'office. Absent = aucune statistique relevée.
  statsPresetKey?: string;
  tiebreakers: TournamentTiebreaker[];
  fixedScoring: { win: number; loss: number; draw: number };
  swissPairing: "ranked" | "random-in-bracket";
  bestOf: number;
  resultMode: "points" | "selection";
  requireMatchStats: boolean;
  // Scénarios proposés par le jeu, à piocher dans le pool d'une phase.
  scenarios: { id: string; name: string; description?: string }[];
};

/**
 * Départages proposés à une phase qui retient ce preset. Ceux du jeu quand
 * c'est le preset réglé pour lui, ceux du preset choisi sinon : une chaîne
 * réglée pour un format ne suit pas un autre format.
 */
export function defaultTiebreakersFor(
  gameDefaults: PhaseGameDefaults,
  preset: PhasePresetOption | undefined
): TournamentTiebreaker[] {
  if (preset?.key === gameDefaults.statsPresetKey) {
    return effectiveTiebreakers(gameDefaults.tiebreakers, preset);
  }
  return officialTiebreakers(preset);
}
