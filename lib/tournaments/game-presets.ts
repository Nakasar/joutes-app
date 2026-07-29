import {
  DEFAULT_FIXED_SCORING,
  type TournamentFixedScoring,
  type TournamentResultMode,
  type TournamentSwissPairing,
} from "@/lib/types/Tournament";

// Statistique secondaire relevée à la fin de chaque partie, propre à un jeu
// (points de victoire, cartes d'objectif, blessures infligées…). Elle ne décide
// jamais du vainqueur — celui-ci est désigné par le jeu — et ne sert qu'aux
// départages et à la lecture du classement.
export type MatchStatDefinition = {
  // Identifiant stable, stocké dans les résultats de parties. Ne doit jamais
  // changer : les parties déjà rapportées y sont rattachées.
  key: string;
  // Clé de traduction sous `Tournaments.matchStats`, dans les quatre locales.
  labelKey: string;
  // Valeur créditée au joueur qui reçoit un BYE (ou qui l'emporte par forfait).
  byeValue: number;
  // Borne haute de saisie, pour éviter les fautes de frappe.
  max: number;
};

// Critère de départage appliqué après les points de match. `stat:<clé>` désigne
// une statistique du preset ; les autres sont les critères historiques.
export type TiebreakerKey = "omw" | "gamesDiff" | "gamesWon" | `stat:${string}`;

// Chaîne de départage historique, conservée pour toutes les phases sans preset.
export const DEFAULT_TIEBREAKERS: TiebreakerKey[] = ["omw", "gamesDiff", "gamesWon"];

// Réglages de format livrés avec un jeu. Le preset n'est pas modifiable par
// l'organisateur : il traduit les règles officielles du jeu. L'organisateur
// choisit seulement de l'appliquer ou non à une phase.
export type GameTournamentPreset = {
  // Identifiant stocké sur la phase (`statsPresetKey`).
  key: string;
  // Clé de traduction sous `Tournaments.matchStats.presets`.
  labelKey: string;
  // Slugs des jeux auxquels le preset est proposé.
  gameSlugs: string[];
  stats: MatchStatDefinition[];
  // Départages appliqués après les points de match, dans cet ordre.
  tiebreakers: TiebreakerKey[];
  // Valeurs pré-remplies dans le formulaire de phase quand le preset est choisi.
  defaults: {
    fixedScoring: TournamentFixedScoring;
    swissPairing: TournamentSwissPairing;
    bestOf: number;
    resultMode: TournamentResultMode;
  };
};

export const GAME_TOURNAMENT_PRESETS: GameTournamentPreset[] = [
  {
    // Star Wars™: Shatterpoint — League Event (Atomic Mass Games, 31/03/25).
    // Barème 3/0/1, appariement aléatoire dans chaque groupe de points, et
    // départage par cartes de lutte revendiquées puis blessures infligées.
    // Le BYE vaut une victoire avec 2 cartes de lutte et 3 blessures.
    key: "swp-league",
    labelKey: "swpLeague",
    gameSlugs: ["shatterpoint"],
    stats: [
      { key: "struggles", labelKey: "struggles", byeValue: 2, max: 10 },
      { key: "wounds", labelKey: "wounds", byeValue: 3, max: 99 },
    ],
    tiebreakers: ["stat:struggles", "stat:wounds", "omw"],
    defaults: {
      fixedScoring: { win: 3, loss: 0, draw: 1 },
      swissPairing: "random-in-bracket",
      bestOf: 1,
      resultMode: "selection",
    },
  },
  {
    // Format à points de victoire, commun aux jeux de figurines à objectifs
    // (Warhammer 40 000, Age of Sigmar, Star Wars: Legion). Le vainqueur reste
    // désigné par les joueurs ; les points de victoire départagent.
    key: "victory-points",
    labelKey: "victoryPoints",
    gameSlugs: ["w40k", "warhammer", "legion"],
    stats: [{ key: "victoryPoints", labelKey: "victoryPoints", byeValue: 0, max: 999 }],
    tiebreakers: ["stat:victoryPoints", "omw", "gamesDiff"],
    defaults: {
      fixedScoring: DEFAULT_FIXED_SCORING,
      swissPairing: "ranked",
      bestOf: 1,
      resultMode: "selection",
    },
  },
  {
    // Blood Bowl : le score du match (touchdowns) et les sorties adverses sont
    // les deux repères habituels d'une ligue.
    key: "blood-bowl",
    labelKey: "bloodBowl",
    gameSlugs: ["bb"],
    stats: [
      { key: "touchdowns", labelKey: "touchdowns", byeValue: 2, max: 99 },
      { key: "casualties", labelKey: "casualties", byeValue: 0, max: 99 },
    ],
    tiebreakers: ["stat:touchdowns", "stat:casualties", "omw"],
    defaults: {
      fixedScoring: DEFAULT_FIXED_SCORING,
      swissPairing: "ranked",
      bestOf: 1,
      resultMode: "selection",
    },
  },
];

/** Presets proposés pour un jeu donné. Vide si le jeu n'en a pas. */
export function presetsForGameSlug(slug?: string | null): GameTournamentPreset[] {
  if (!slug) return [];
  return GAME_TOURNAMENT_PRESETS.filter((preset) => preset.gameSlugs.includes(slug));
}

/**
 * Preset appliqué à une phase. Renvoie `undefined` quand la phase n'en utilise
 * pas, ou quand la clé stockée ne correspond plus à aucun preset livré (preset
 * retiré d'une version à l'autre) : le classement retombe alors sur les
 * départages historiques, sans perdre les résultats déjà rapportés.
 */
export function getPreset(key?: string | null): GameTournamentPreset | undefined {
  if (!key) return undefined;
  return GAME_TOURNAMENT_PRESETS.find((preset) => preset.key === key);
}

/** Clés de statistiques d'un preset, dans l'ordre de saisie. */
export function presetStatKeys(preset?: GameTournamentPreset): string[] {
  return preset ? preset.stats.map((stat) => stat.key) : [];
}

/** Départages d'un preset, ou la chaîne historique en son absence. */
export function presetTiebreakers(preset?: GameTournamentPreset): TiebreakerKey[] {
  return preset ? preset.tiebreakers : DEFAULT_TIEBREAKERS;
}

/**
 * Statistiques créditées au joueur qui remporte un match sans le jouer (BYE ou
 * forfait de l'adversaire). Vide si la phase n'utilise pas de preset.
 */
export function byeStats(preset?: GameTournamentPreset): Record<string, number> {
  if (!preset) return {};
  return Object.fromEntries(preset.stats.map((stat) => [stat.key, stat.byeValue]));
}
