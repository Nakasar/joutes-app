import { z } from "zod";

import { externalUrl } from "@/lib/lairs/urls";
import { POSTER_STYLE_KEYS } from "@/lib/posters/styles";

/**
 * Ce que l'écran de gestion enregistre pour l'affiche.
 *
 * Séparé de `lairCustomizationSchema` : ces réglages ont leur propre onglet,
 * leur propre bouton d'enregistrement, et rien de la vitrine ne dépend d'eux.
 * Le style Pro n'est pas refusé ici mais par l'action, qui sait si le lieu
 * l'est ; le schéma ne connaît que la forme.
 */

/** Une chaîne facultative : le vide vaut « non renseigné », pas « chaîne vide ». */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} est trop long`)
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional();

/**
 * Une URL saisie par le lieu — le logo de sa signature, la cible de son QR
 * code. Même règle que la vitrine : `url()` seul laisse passer `javascript:`
 * et `data:`, et ces valeurs finissent dans un `src` et dans un QR code que
 * l'on scanne sans le lire.
 *
 * Le rognage précède le contrôle, et le vide y est admis avec le reste plutôt
 * que dans une branche à lui : deux espaces collés dans le champ sont un champ
 * vidé, comme partout ailleurs dans ce formulaire, et non un enregistrement
 * refusé en bloc.
 */
const optionalUrl = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || externalUrl(value) !== null,
    "L'URL doit être une adresse http(s) valide",
  )
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

/** La signature du pied d'affiche, à la place du bloc Joutes. */
export const posterBrandingSchema = z.object({
  logo: optionalUrl,
  title: optionalText(40, "Le titre de la signature"),
  text: optionalText(120, "La ligne de la signature"),
});

/** L'appel à l'action, et ce que le QR code encode. */
export const posterCallToActionSchema = z.object({
  title: optionalText(60, "Le titre de l'appel à l'action"),
  text: optionalText(120, "Le texte de l'appel à l'action"),
  url: optionalUrl,
});

export const lairPosterSettingsSchema = z.object({
  style: z.enum(POSTER_STYLE_KEYS).optional(),
  showAttendance: z.boolean().optional(),
  gameLogos: z.boolean().optional(),
  branding: posterBrandingSchema.optional(),
  cta: posterCallToActionSchema.optional(),
});

export type LairPosterSettingsInput = z.input<typeof lairPosterSettingsSchema>;
