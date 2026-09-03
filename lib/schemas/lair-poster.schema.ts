import { z } from "zod";

import { POSTER_STYLE_KEYS } from "@/lib/posters/styles";

/**
 * Ce que l'écran de gestion enregistre pour l'affiche.
 *
 * Séparé de `lairCustomizationSchema` : ces réglages ont leur propre onglet,
 * leur propre bouton d'enregistrement, et rien de la vitrine ne dépend d'eux.
 * Le style Pro n'est pas refusé ici mais par l'action, qui sait si le lieu
 * l'est ; le schéma ne connaît que la forme.
 */
export const lairPosterSettingsSchema = z.object({
  style: z.enum(POSTER_STYLE_KEYS).optional(),
  showAttendance: z.boolean().optional(),
  gameLogos: z.boolean().optional(),
});

export type LairPosterSettingsInput = z.input<typeof lairPosterSettingsSchema>;
