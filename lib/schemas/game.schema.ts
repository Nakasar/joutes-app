import { z } from "zod";
import { GAME_FEATURE_KEYS } from "@/lib/constants/game-features";
import { GAME_LINK_KEYS } from "@/lib/constants/game-links";
import { DECK_ZONE_KEYS } from "@/lib/decks/zones";
import {
  tournamentResultModeSchema,
  tournamentScenarioSchema,
  tournamentSwissPairingSchema,
  tournamentTiebreakersSchema,
} from "@/lib/schemas/tournament.schema";

export const gameTypeSchema = z.enum(["TCG", "BoardGame", "VideoGame", "Miniatures", "Other"]);

/**
 * Fanions de fonctionnalités. Chaque clé est facultative : un fanion absent
 * vaut « désactivé », ce que tout le code lit déjà par vérité (`features?.cards`).
 */
export const gameFeaturesSchema = z.object(
  Object.fromEntries(GAME_FEATURE_KEYS.map((key) => [key, z.boolean().optional()]))
) as z.ZodType<Partial<Record<(typeof GAME_FEATURE_KEYS)[number], boolean>>>;

/**
 * Le site de l'éditeur et ses réseaux.
 *
 * Chaque clé est facultative, et la **chaîne vide vaut « aucun lien »** : c'est
 * ce que rend un champ qu'on vide, et refuser l'enregistrement pour cette
 * raison rendrait un lien impossible à retirer. La transformation en
 * `undefined` est faite ici plutôt que dans le formulaire, pour que l'API et
 * l'écran se comportent pareil.
 *
 * `z.url()` accepte `javascript:` — le dépôt le note déjà dans
 * `lib/schemas/news.schema.ts`. Le protocole est donc vérifié en plus, faute de
 * quoi l'adresse trouverait une exécution au clic dans le `href` de la fiche.
 */
export const gameLinksSchema = z.object(
  Object.fromEntries(
    GAME_LINK_KEYS.map((key) => [
      key,
      z
        .string()
        .trim()
        .max(500, "L'adresse est trop longue")
        .refine((value) => value.length === 0 || /^https?:\/\//i.test(value), {
          message: "L'adresse doit commencer par http:// ou https://",
        })
        .transform((value) => (value.length > 0 ? value : undefined))
        .optional(),
    ]),
  ),
) as z.ZodType<Partial<Record<(typeof GAME_LINK_KEYS)[number], string | undefined>>>;

export const gameSchema = z.object({
  name: z.string().min(1, "Le nom du jeu est requis").max(100, "Le nom est trop long"),
  slug: z.string().min(1, "Le slug doit contenir au moins 3 caractères").max(20, "Le slug est trop long").optional(),
  icon: z.url("L'URL de l'icône doit être valide").optional(),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(500, "La description est trop longue"),
  type: gameTypeSchema,
  features: gameFeaturesSchema.optional(),
});

/**
 * Réglages de tournoi par défaut d'un jeu (administration). Chaque champ est
 * facultatif : absent, il laisse la main au preset livré avec le jeu.
 *
 * `statsPresetKey` porte trois états, comme le document qu'il alimente :
 * absent (suivre le catalogue), `null` (aucun preset), ou une clé.
 */
export const gameTournamentDefaultsSchema = z.object({
  statsPresetKey: z.string().min(1).max(60).nullable().optional(),
  tiebreakers: tournamentTiebreakersSchema.optional(),
  fixedScoring: z
    .object({
      win: z.number().int().min(-99).max(999),
      loss: z.number().int().min(-99).max(999),
      draw: z.number().int().min(-99).max(999),
    })
    .optional(),
  swissPairing: tournamentSwissPairingSchema.optional(),
  bestOf: z.number().int().min(1).max(9).optional(),
  resultMode: tournamentResultModeSchema.optional(),
  requireMatchStats: z.boolean().optional(),
  // Catalogue de scénarios proposés aux organisateurs. Plus large que le pool
  // d'une phase : il couvre la saison d'un jeu, pas une seule ronde.
  scenarios: z.array(tournamentScenarioSchema).max(200).optional(),
});

export type GameTournamentDefaultsInput = z.infer<typeof gameTournamentDefaultsSchema>;

/**
 * Réglages du deck builder d'un jeu (administration).
 *
 * Les clés de zone sont **choisies, pas inventées** : elles sont écrites dans
 * les documents de deck et relues par `parseDeckText` / le vérificateur de
 * liste. Un `z.enum` sur `DECK_ZONE_KEYS` est donc ce qui tient la promesse du
 * commentaire de `lib/decks/zones.ts`.
 *
 * Les deux bornes sont facultatives et se valident l'une par l'autre : un
 * plancher au-dessus du plafond décrit une zone qu'aucun deck ne peut remplir,
 * et le formulaire l'aurait laissé passer sans que rien ne le signale avant la
 * première liste refusée.
 */
export const deckZoneBoundsSchema = z
  .object({
    key: z.enum(DECK_ZONE_KEYS),
    label: z.string().trim().min(1, "Le libellé de la section est requis").max(40, "Le libellé est trop long"),
    short: z.string().trim().min(1, "Le libellé court est requis").max(20, "Le libellé court est trop long"),
    min: z.number().int().min(0).max(999).optional(),
    max: z.number().int().min(0).max(999).optional(),
    curve: z.boolean().optional(),
  })
  .superRefine((zone, ctx) => {
    if (zone.min !== undefined && zone.max !== undefined && zone.min > zone.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `« ${zone.label} » : le minimum dépasse le maximum`,
        path: ["min"],
      });
    }
  });

export const gameDeckBuilderSchema = z
  .object({
    zones: z.array(deckZoneBoundsSchema).max(DECK_ZONE_KEYS.length),
    maxCopies: z.number().int().min(1).max(99).optional(),
    totalMin: z.number().int().min(0).max(9999).optional(),
    totalMax: z.number().int().min(0).max(9999).optional(),
    unlimitedTypes: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  })
  .superRefine((settings, ctx) => {
    // Une clé en double ferait deux sections que rien ne distingue en base :
    // les cartes de l'une iraient dans l'autre au premier enregistrement.
    const seen = new Set<string>();
    for (const zone of settings.zones) {
      if (seen.has(zone.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `La section « ${zone.key} » est déclarée deux fois`,
          path: ["zones"],
        });
      }
      seen.add(zone.key);
    }

    if (
      settings.totalMin !== undefined &&
      settings.totalMax !== undefined &&
      settings.totalMin > settings.totalMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La taille totale minimale dépasse la maximale",
        path: ["totalMin"],
      });
    }
  });

export type GameDeckBuilderInput = z.infer<typeof gameDeckBuilderSchema>;

/**
 * Édition du jeu en cours — la valeur que porte l'attribut `edition` des
 * produits qui se jouent aujourd'hui, et que les catalogues montrent par défaut.
 *
 * La chaîne vide est **acceptée** : c'est ainsi qu'on déclare qu'un jeu n'a pas
 * d'éditions, et l'action serveur la traduit en retrait du champ. Les bornes
 * sont celles d'une valeur d'attribut de produit, puisque c'est à elles qu'elle
 * est comparée.
 */
export const currentProductEditionSchema = z
  .string()
  .trim()
  .max(60, "Le nom d'une édition est trop long");

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const gameIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide");

export type GameInput = z.infer<typeof gameSchema>;
