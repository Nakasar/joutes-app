import { z } from "zod";
import {
  MAX_ARMY_NAME_LENGTH,
  MAX_ARMY_UNITS,
  MAX_NOTES_LENGTH,
  MAX_SCENARIO_LENGTH,
  MAX_UNIT_NAME_LENGTH,
  MAX_UNIT_QUANTITY,
} from "@/lib/battle-reports/army";
import {
  BATTLE_MAP_SHAPES,
  MAX_LABEL_LENGTH,
  MAX_SNAPSHOTS,
  MAX_TABLE_SIDE,
  MAX_TERRAIN_PIECES,
  MAX_UNIT_TOKENS,
} from "@/lib/battle-reports/battle-map";
import {
  GUEST_ID_PATTERN,
  MAX_GUESTS,
  MAX_GUEST_NAME_LENGTH,
} from "@/lib/matches/participants";

/**
 * Un participant est soit un compte (`ObjectId`), soit un invité (`guest_…`).
 * Tout ce qui est indexé par participant — listes d'armée, jetons de la table,
 * vainqueurs — accepte donc les deux formes. Le motif de l'invité est repris de
 * `lib/matches/participants.ts` plutôt que réécrit : une seule définition, pas
 * deux qui divergent.
 */
const participantIdPattern = new RegExp(
  `^(?:[0-9a-fA-F]{24}|${GUEST_ID_PATTERN.source.slice(1, -1)})$`
);

export const participantIdSchema = z
  .string()
  .regex(participantIdPattern, "L'identifiant doit être celui d'un compte ou d'un invité");

export const gameMatchGuestSchema = z.object({
  id: z.string().regex(GUEST_ID_PATTERN, "L'identifiant d'un invité doit être de la forme guest_…"),
  name: z.string().trim().min(1, "Le nom de l'invité est requis").max(MAX_GUEST_NAME_LENGTH),
});

/**
 * Une ligne de liste d'armée. `productId` est l'identifiant d'un produit **au
 * sein d'un jeu** (`spearhead-vader`), et non un ObjectId : il n'a donc pas la
 * forme des autres identifiants de ce fichier. Il reste facultatif, une
 * figurine absente du catalogue devant pouvoir être saisie à la main.
 */
export const battleReportArmyUnitSchema = z.object({
  productId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1, "Le nom de la figurine est requis").max(MAX_UNIT_NAME_LENGTH),
  image: z.url("L'image de la figurine doit être une URL valide").max(2048).optional(),
  quantity: z.number().int().min(1).max(MAX_UNIT_QUANTITY),
});

export const battleReportArmySchema = z.object({
  name: z.string().trim().max(MAX_ARMY_NAME_LENGTH).optional(),
  units: z.array(battleReportArmyUnitSchema).max(MAX_ARMY_UNITS).default([]),
});

/**
 * Table de jeu. Les bornes sont celles de `lib/battle-reports/battle-map.ts` ;
 * ce qui dépasse est **ramené** par la normalisation plutôt que refusé — une
 * table rétrécie après coup ne doit pas rendre tout un rapport inenregistrable.
 * Le schéma n'est là que pour écarter ce qui n'a pas la bonne forme.
 */
const battleMapIdSchema = z.string().trim().min(1).max(40);
const battleMapColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "La couleur doit être au format #rrggbb");
const battleMapCoordinateSchema = z.number().finite().min(-MAX_TABLE_SIDE).max(2 * MAX_TABLE_SIDE);

export const battleMapTerrainSchema = z.object({
  id: battleMapIdSchema,
  shape: z.enum(BATTLE_MAP_SHAPES),
  name: z.string().trim().max(MAX_LABEL_LENGTH).optional(),
  color: battleMapColorSchema,
  x: battleMapCoordinateSchema,
  y: battleMapCoordinateSchema,
  width: z.number().finite().positive().max(MAX_TABLE_SIDE),
  height: z.number().finite().positive().max(MAX_TABLE_SIDE),
});

export const battleMapUnitTokenSchema = z.object({
  id: battleMapIdSchema,
  playerId: participantIdSchema,
  unitName: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
  productId: z.string().trim().min(1).max(120).optional(),
  image: z.url().max(2048).optional(),
  x: battleMapCoordinateSchema,
  y: battleMapCoordinateSchema,
  diameter: z.number().finite().positive().max(MAX_TABLE_SIDE),
});

export const battleMapSnapshotSchema = z.object({
  id: battleMapIdSchema,
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
  units: z.array(battleMapUnitTokenSchema).max(MAX_UNIT_TOKENS).default([]),
});

export const battleMapSchema = z.object({
  table: z.object({
    width: z.number().finite().positive().max(MAX_TABLE_SIDE),
    height: z.number().finite().positive().max(MAX_TABLE_SIDE),
  }),
  terrain: z.array(battleMapTerrainSchema).max(MAX_TERRAIN_PIECES).default([]),
  snapshots: z.array(battleMapSnapshotSchema).max(MAX_SNAPSHOTS).default([]),
  playerColors: z.record(z.string(), battleMapColorSchema).optional(),
});

export const battleReportSchema = z.object({
  scenario: z.string().trim().max(MAX_SCENARIO_LENGTH).optional(),
  notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  armies: z.record(participantIdSchema, battleReportArmySchema).optional(),
  map: battleMapSchema.optional(),
});

export const gameMatchRatingSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID de l'utilisateur doit être un ObjectId MongoDB valide"),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const gameMatchMVPVoteSchema = z.object({
  // Seul un compte vote — un invité ne se connecte pas —, mais chacun peut voter
  // pour n'importe quel participant, invités compris.
  voterId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du votant doit être un ObjectId MongoDB valide"),
  votedForId: participantIdSchema,
});

export const gameMatchSchema = z.object({
  gameId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide"),
  playedAt: z.coerce.date(),
  lairId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du lair doit être un ObjectId MongoDB valide").optional(),
  playerIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du joueur doit être un ObjectId MongoDB valide")).min(1, "Au moins un joueur est requis"),
  ratings: z.array(gameMatchRatingSchema).optional(),
  mvpVotes: z.array(gameMatchMVPVoteSchema).optional(),
  // Un invité gagne comme un autre : les vainqueurs sont des participants.
  winnerIds: z.array(participantIdSchema).optional(),
  guests: z.array(gameMatchGuestSchema).max(MAX_GUESTS).optional(),
  decks: z.record(z.string(), z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du deck doit être un ObjectId MongoDB valide")).optional(),
  // Présent = la partie est saisie en rapport de bataille, même vide.
  battleReport: battleReportSchema.optional(),
});

export type GameMatchInput = z.infer<typeof gameMatchSchema>;
export type BattleReportInput = z.infer<typeof battleReportSchema>;
export type BattleReportArmyInput = z.infer<typeof battleReportArmySchema>;
export type BattleMapInput = z.infer<typeof battleMapSchema>;
