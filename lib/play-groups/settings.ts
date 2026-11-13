import { z } from "zod";
import type { PlayGroupTheme } from "@/lib/types/PlayGroup";

/**
 * Réglages d'un groupe modifiables par l'API (`PATCH /api/play-groups/{id}`),
 * pour l'app mobile : identité (nom, description, accroche), emblème et
 * bannière, visibilité.
 *
 * Contrairement au formulaire du site, qui renvoie toute l'identité d'un bloc,
 * chaque clé est facultative : une clé absente ne change rien, une chaîne vide
 * efface le champ (sauf le nom, qui est requis). Les liens, le rythme et
 * l'accent restent au site.
 */

const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || /^https?:\/\//i.test(value), {
    message: "L'adresse doit commencer par http:// ou https://",
  });

export const playGroupSettingsSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    tagline: z.string().trim().max(140).optional(),
    logo: imageUrl.optional(),
    banner: imageUrl.optional(),
    visibility: z.enum(["public", "private"]).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Aucun réglage à enregistrer",
  });

export type PlayGroupSettingsInput = z.infer<typeof playGroupSettingsSchema>;

const THEME_KEYS = ["logo", "banner", "tagline"] as const;

/**
 * Le thème après application des réglages, ou `null` s'ils n'y touchent pas.
 * Le reste du thème (l'accent) est gardé tel quel ; une chaîne vide retire le
 * champ.
 */
export function mergePlayGroupTheme(
  current: PlayGroupTheme | undefined,
  input: PlayGroupSettingsInput,
): PlayGroupTheme | null {
  if (!THEME_KEYS.some((key) => input[key] !== undefined)) return null;
  const next: PlayGroupTheme = { ...(current ?? {}) };
  for (const key of THEME_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === "") delete next[key];
    else next[key] = value;
  }
  return next;
}
