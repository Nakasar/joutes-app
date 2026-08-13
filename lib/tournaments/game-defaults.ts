import {
  DEFAULT_FIXED_SCORING,
  type TournamentFixedScoring,
  type TournamentResultMode,
  type TournamentScenario,
  type TournamentSwissPairing,
  type TournamentTiebreaker,
} from "@/lib/types/Tournament";
import {
  type GameTournamentPreset,
  defaultPresetForGameSlug,
  getPreset,
  presetsForGameSlug,
  resolveTiebreakers,
} from "@/lib/tournaments/game-presets";

/**
 * Réglages de tournoi d'un jeu, tenus par l'administration.
 *
 * Ils ne remplacent pas les presets livrés (`game-presets.ts`) : ceux-ci
 * décrivent ce qu'un jeu relève à chaque partie — des clés de statistiques
 * inscrites dans les résultats déjà rapportés et dans les écrans de saisie des
 * deux applications, qui ne peuvent pas se rédiger depuis un formulaire. Ce qui
 * se règle ici, c'est ce qu'on en fait par défaut : quel preset s'applique
 * d'office, dans quel ordre on départage, quels scénarios on propose.
 *
 * Chaque champ absent laisse la main au preset livré, et un jeu sans réglage se
 * comporte exactement comme avant. C'est ce qui rend la table de code et le
 * document de base compatibles sans migration.
 */
export type GameTournamentDefaults = {
  // Preset de statistiques appliqué d'office aux nouvelles phases.
  // - absent : le preset livré pour ce jeu (celui marqué `applyByDefault`) ;
  // - `null` : aucun preset, l'administration a retiré celui du catalogue ;
  // - une clé : ce preset-là.
  statsPresetKey?: string | null;
  // Chaîne de départage proposée aux nouvelles phases. Absente = celle du
  // preset effectif. Un tableau vide est un choix : aucun départage.
  tiebreakers?: TournamentTiebreaker[];
  // Barème d'une victoire / défaite / match nul.
  fixedScoring?: TournamentFixedScoring;
  // Appariement suisse à l'intérieur d'un même total de points.
  swissPairing?: TournamentSwissPairing;
  // Nombre de parties par match (best-of-n).
  bestOf?: number;
  // Comment le résultat d'une partie est renseigné.
  resultMode?: TournamentResultMode;
  // Saisie des statistiques exigée pour rapporter un résultat.
  requireMatchStats?: boolean;
  // Scénarios (ou missions) proposés aux organisateurs. Le pool d'une phase
  // reste libre : ce catalogue évite de retaper les missions officielles à
  // chaque tournoi, il ne les impose pas.
  scenarios?: TournamentScenario[];
};

/** Réglages effectivement appliqués à une nouvelle phase de ce jeu. */
export type ResolvedGameTournamentDefaults = {
  // Preset effectif, quand il y en a un. Porte les statistiques relevées.
  preset?: GameTournamentPreset;
  statsPresetKey?: string;
  tiebreakers: TournamentTiebreaker[];
  fixedScoring: TournamentFixedScoring;
  swissPairing: TournamentSwissPairing;
  bestOf: number;
  resultMode: TournamentResultMode;
  requireMatchStats: boolean;
  scenarios: TournamentScenario[];
};

/**
 * Preset appliqué d'office à ce jeu : celui que l'administration a choisi,
 * sinon celui que le catalogue retient pour ce jeu. `null` en configuration
 * veut dire « aucun », et se distingue donc d'une configuration muette.
 *
 * Une clé inconnue (preset retiré d'une version à l'autre) retombe sur le
 * catalogue plutôt que de laisser le jeu sans statistiques du jour au
 * lendemain : le réglage devient caduc, il ne casse rien.
 */
function resolvePreset(
  gameSlug: string | undefined | null,
  configured: GameTournamentDefaults | undefined
): GameTournamentPreset | undefined {
  if (configured?.statsPresetKey === null) return undefined;
  if (configured?.statsPresetKey !== undefined) {
    return getPreset(configured.statsPresetKey) ?? defaultPresetForGameSlug(gameSlug);
  }
  return defaultPresetForGameSlug(gameSlug);
}

/**
 * Réglages d'une nouvelle phase pour ce jeu, réglages d'administration
 * appliqués par-dessus le preset livré, lui-même par-dessus les défauts de la
 * plateforme. Sans jeu ni configuration, on retombe sur ces derniers — un
 * tournoi sans jeu du catalogue reste un tournoi ordinaire.
 */
export function resolveGameTournamentDefaults(
  gameSlug: string | undefined | null,
  configured: GameTournamentDefaults | undefined
): ResolvedGameTournamentDefaults {
  const preset = resolvePreset(gameSlug, configured);
  const presetDefaults = preset?.defaults;

  return {
    preset,
    statsPresetKey: preset?.key,
    // `resolveTiebreakers` écarte les critères que le preset effectif ne sait
    // pas calculer : un départage réglé sous un autre preset ne suit pas.
    tiebreakers: resolveTiebreakers(configured?.tiebreakers, preset),
    fixedScoring: configured?.fixedScoring ?? presetDefaults?.fixedScoring ?? DEFAULT_FIXED_SCORING,
    swissPairing: configured?.swissPairing ?? presetDefaults?.swissPairing ?? "ranked",
    bestOf: configured?.bestOf ?? presetDefaults?.bestOf ?? 1,
    resultMode: configured?.resultMode ?? presetDefaults?.resultMode ?? "selection",
    requireMatchStats:
      configured?.requireMatchStats ?? presetDefaults?.requireStats ?? false,
    scenarios: configured?.scenarios ?? [],
  };
}

/**
 * Presets proposés à l'organisateur d'un tournoi de ce jeu : ceux que le
 * catalogue déclare pour lui, et celui que l'administration a choisi s'il vient
 * d'ailleurs. Sans cette réunion, un preset réglé en administration
 * s'appliquerait aux phases sans jamais apparaître dans leur formulaire.
 */
export function presetOptionsForGame(
  gameSlug: string | undefined | null,
  configured: GameTournamentDefaults | undefined
): GameTournamentPreset[] {
  const options = presetsForGameSlug(gameSlug);
  const chosen = resolvePreset(gameSlug, configured);
  if (chosen && !options.some((option) => option.key === chosen.key)) {
    return [chosen, ...options];
  }
  return options;
}
