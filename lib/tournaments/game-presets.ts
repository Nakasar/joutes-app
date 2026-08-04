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
  // Preset proposé d'emblée à la création d'une phase pour l'un de ses jeux.
  // Les tournois de figurines à grande armée relèvent leurs statistiques par
  // défaut : l'organisateur les retire s'il n'en veut pas, plutôt que d'avoir à
  // se souvenir de les activer.
  applyByDefault?: boolean;
  // Valeurs pré-remplies dans le formulaire de phase quand le preset est choisi.
  defaults: {
    fixedScoring: TournamentFixedScoring;
    swissPairing: TournamentSwissPairing;
    bestOf: number;
    resultMode: TournamentResultMode;
    // Saisie des statistiques exigée pour rapporter un résultat. Reste un
    // réglage de phase : le preset ne fait que proposer l'usage du jeu.
    requireStats: boolean;
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
      requireStats: false,
    },
  },
  {
    // Jeux de figurines à grande armée (Warhammer 40 000, Warhammer, Star Wars:
    // Legion). Chaque partie relève deux scores que les joueurs tiennent déjà
    // sur leur feuille de match :
    // - le score de bataille (« battle points »), marqué sur les objectifs de
    //   la mission, qui départage à égalité de points de tournoi ;
    // - le score de destruction (« points destroyed »), la valeur en points de
    //   l'armée adverse détruite, conservé pour l'historique du tournoi.
    // Départage : points de tournoi (victoires/nuls/défaites, appliqués avant
    // toute cette chaîne), puis score de bataille, puis résistance (OMW%).
    key: "battle-points",
    labelKey: "battlePoints",
    gameSlugs: ["w40k", "warhammer", "legion"],
    // Format habituel de ces jeux : les statistiques y sont exigées, pas
    // optionnelles — un tournoi ne peut pas départager sans elles.
    applyByDefault: true,
    stats: [
      // Un BYE est crédité du barème plein de la mission (100 points de
      // bataille), comme le veut l'usage : le joueur exempté ne doit pas être
      // rétrogradé au départage pour une partie qu'on ne lui a pas donnée.
      { key: "battlePoints", labelKey: "battlePoints", byeValue: 100, max: 999 },
      // Rien n'a été détruit : le score de destruction d'un BYE est nul, et il
      // ne sert de toute façon pas au départage.
      { key: "pointsDestroyed", labelKey: "pointsDestroyed", byeValue: 0, max: 9999 },
    ],
    tiebreakers: ["stat:battlePoints", "omw"],
    defaults: {
      fixedScoring: DEFAULT_FIXED_SCORING,
      swissPairing: "ranked",
      bestOf: 1,
      resultMode: "selection",
      requireStats: true,
    },
  },
  {
    // Format à points de victoire, commun aux jeux de figurines à objectifs.
    // Plus léger que `battle-points` : une seule statistique, sans obligation
    // de saisie. Conservé pour les phases qui l'utilisent déjà et pour les
    // formats maison qui ne relèvent pas la destruction.
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
      requireStats: false,
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
      requireStats: false,
    },
  },
];

/** Presets proposés pour un jeu donné. Vide si le jeu n'en a pas. */
export function presetsForGameSlug(slug?: string | null): GameTournamentPreset[] {
  if (!slug) return [];
  return GAME_TOURNAMENT_PRESETS.filter((preset) => preset.gameSlugs.includes(slug));
}

/**
 * Preset pré-sélectionné à la création d'une phase pour ce jeu. Absent quand le
 * jeu n'en impose aucun : l'organisateur part alors d'une phase sans
 * statistique, comme avant.
 */
export function defaultPresetForGameSlug(slug?: string | null): GameTournamentPreset | undefined {
  return presetsForGameSlug(slug).find((preset) => preset.applyByDefault);
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

/**
 * Statistiques manquantes dans le résultat d'une partie, quand la phase les
 * exige. Chaque joueur du match doit porter une valeur pour chaque statistique
 * du preset : un score de bataille absent ne se devine pas et fausserait le
 * départage de tout le tableau.
 *
 * Renvoie les couples (joueur, statistique) en défaut, vide si tout est saisi.
 * La saisie applique la même règle sur ses champs, mais sur des chaînes en
 * cours de frappe : elle ne peut pas passer par ici, où les valeurs sont déjà
 * des nombres. C'est ce contrôle-ci qui fait foi.
 */
export function missingRequiredStats(
  stats: Record<string, Record<string, number>> | undefined,
  matchPlayerIds: string[],
  statKeys: string[]
): { playerId: string; key: string }[] {
  if (statKeys.length === 0) return [];
  const missing: { playerId: string; key: string }[] = [];
  for (const playerId of matchPlayerIds) {
    const playerStats = stats?.[playerId];
    for (const key of statKeys) {
      const value = playerStats?.[key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        missing.push({ playerId, key });
      }
    }
  }
  return missing;
}
