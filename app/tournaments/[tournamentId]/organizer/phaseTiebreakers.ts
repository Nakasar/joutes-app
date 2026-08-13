import { DEFAULT_TIEBREAKERS, GENERIC_TIEBREAKERS } from "@/lib/tournaments/game-presets";
import type { TournamentTiebreaker } from "@/lib/types/Tournament";

/**
 * Départages côté configuration : la même résolution que le serveur applique au
 * classement (lib/tournaments/game-presets.ts), mais à partir des presets tels
 * que la page les transmet. L'organisateur doit lire à l'écran exactement la
 * chaîne qui sera appliquée — sinon autant ne rien afficher.
 */

// Preset de format proposé par le jeu du tournoi, résolu côté serveur.
export type PhasePresetOption = {
  key: string;
  labelKey: string;
  // Preset retenu d'emblée pour une nouvelle phase (usage du jeu).
  applyByDefault: boolean;
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
