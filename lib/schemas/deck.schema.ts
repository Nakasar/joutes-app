import { z } from "zod";

import { DECK_ZONE_KEYS } from "@/lib/decks/zones";

export const deckVisibilitySchema = z.enum(["private", "unlisted", "public"]);

/**
 * Une carte du deck : l'identifiant du catalogue et le nombre d'exemplaires.
 *
 * Le plafond de 99 n'est la règle d'aucun jeu — c'est une borne de saisie.
 * Ce qui décide de la légalité d'un deck, ce sont les zones du jeu
 * (`lib/decks/zones.ts`), pas ce schéma : celui-ci empêche seulement d'écrire
 * en base une quantité qui n'a pas de sens.
 */
export const deckCardEntrySchema = z.object({
  cardId: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(99),
});

export const deckCardsSchema = z
  .object(
    Object.fromEntries(
      DECK_ZONE_KEYS.map((key) => [key, z.array(deckCardEntrySchema).max(500).optional()])
    ) as Record<(typeof DECK_ZONE_KEYS)[number], z.ZodOptional<z.ZodArray<typeof deckCardEntrySchema>>>
  )
  .strict();

export const deckGuideSectionSchema = z.object({
  title: z.string().min(1, "Le titre de la section est requis").max(120, "Le titre est trop long"),
  body: z.string().max(4000, "La section est trop longue"),
});

export const deckMatchupSchema = z.object({
  name: z.string().min(1).max(120),
  rating: z.enum(["favorable", "even", "unfavorable"]),
});

export const deckSchema = z.object({
  name: z.string().min(1, "Le nom du deck est requis").max(100, "Le nom est trop long"),
  gameId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du jeu doit être un ObjectId MongoDB valide"),
  url: z.string().url("L'URL doit être valide").optional().or(z.literal("")),
  description: z.string().max(2000, "La description est trop longue").optional(),
  decklist: z.string().max(20000, "La liste de cartes est trop longue").optional(),
  cards: deckCardsSchema.optional(),
  guide: z.array(deckGuideSectionSchema).max(20, "Le guide compte trop de sections").optional(),
  matchups: z.array(deckMatchupSchema).max(40, "Trop de confrontations").optional(),
  notes: z.string().max(4000, "Les notes sont trop longues").optional(),
  format: z.string().max(80, "Le nom du format est trop long").optional(),
  legendCardId: z.string().max(200).optional(),
  visibility: deckVisibilitySchema.default("private"),
});

export const deckUpdateSchema = deckSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const deckIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID du deck doit être un ObjectId MongoDB valide");

export type DeckInput = z.infer<typeof deckSchema>;
export type DeckUpdateInput = z.infer<typeof deckUpdateSchema>;
