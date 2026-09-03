import { z } from "zod";

import { MAX_POSTER_GAMES, MAX_POSTER_LAIRS } from "@/lib/posters/selection";
import { MAX_POSTER_NAME } from "@/lib/posters/limits";
import { POSTER_PERIODS, POSTER_STYLE_KEYS } from "@/lib/posters/styles";

/**
 * Ce qu'un joueur enregistre d'une affiche.
 *
 * Les mêmes bornes que la lecture d'une URL d'affiche
 * (`lib/posters/selection.ts`) : ce qu'on refuse de rendre, on refuse de
 * l'enregistrer. Sans quoi la base porterait des affiches que la page écarte,
 * et l'écran promettrait ce qu'aucune adresse ne sait montrer.
 *
 * La date n'y figure pas, et c'est le cœur de l'affaire : une affiche gardée
 * est une recette, pas un instantané. Voir `lib/types/SavedPoster.ts`.
 */
export const savedPosterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis")
    .max(MAX_POSTER_NAME, "Le nom est trop long"),
  // Un identifiant Mongo, et rien d'autre : c'est ce que la page d'affiche
  // acceptera de relire.
  lairIds: z
    .array(z.string().regex(/^[0-9a-f]{24}$/i, "Identifiant de lieu invalide"))
    .min(1, "Choisissez au moins un lieu")
    .max(MAX_POSTER_LAIRS, `${MAX_POSTER_LAIRS} lieux au maximum`),
  gameIds: z
    .array(z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/, "Identifiant de jeu invalide"))
    .max(MAX_POSTER_GAMES, `${MAX_POSTER_GAMES} jeux au maximum`),
  period: z.enum(POSTER_PERIODS),
  style: z.enum(POSTER_STYLE_KEYS),
  showAttendance: z.boolean(),
  gameLogos: z.boolean(),
});

export type SavedPosterFormInput = z.input<typeof savedPosterSchema>;
