import { z } from "zod";

import { externalUrl } from "@/lib/lairs/urls";
import { MAX_USER_LINKS } from "@/lib/users/links";
import { USER_SHOWCASE_SECTION_KEYS } from "@/lib/users/showcase";

/**
 * Ce qu'un compte peut écrire sur sa propre vitrine.
 *
 * **Séparé de `lib/schemas/user.schema.ts` à dessein**, comme
 * `lair-customization.schema.ts` l'est de `lair.schema.ts` : celui-là décrit le
 * compte tel que l'application le manipule, celui-ci la seule surface que son
 * titulaire dessine. Les faire cohabiter obligerait le formulaire de vitrine à
 * renvoyer le compte entier — donc à pouvoir réécrire son e-mail, ses amis ou
 * sa visibilité pour changer un ordre de blocs.
 *
 * Ce qui n'y figure pas l'est tout autant : ni contour d'avatar, ni badge. Ils
 * se dérivent du palier et des statuts, ils ne se règlent pas.
 */

/**
 * Une URL saisie par le compte.
 *
 * `url()` seul accepte `javascript:` et `data:` : ces valeurs finissent dans
 * des `href` sur une page publique. Le contrôle délègue à `externalUrl`, qui
 * porte la règle du dépôt **et** la garde qu'un `refine` seul n'a pas : en Zod,
 * l'échec de `.url()` ne coupe pas la chaîne, le raffinement suivant s'exécute
 * quand même, et un `new URL()` nu y **lève** au lieu de refuser.
 */
const externalUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => externalUrl(value) !== null, "L'adresse doit être en http(s)");

/** Une image : une URL http(s), ou rien. Le vide vaut « retirer ». */
const optionalImageUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => (value.length > 0 ? value : undefined))
  .refine((value) => value === undefined || externalUrl(value) !== null, {
    message: "L'adresse doit être en http(s)",
  })
  .optional();

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} est trop long`)
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional();

export const userShowcaseSectionSchema = z.object({
  key: z.enum(USER_SHOWCASE_SECTION_KEYS),
  enabled: z.boolean(),
});

export const userShowcaseLinkSchema = z.object({
  url: externalUrlSchema,
  label: optionalText(60, "Le libellé"),
});

export const userShowcaseSchema = z.object({
  banner: optionalImageUrl,
  sections: z.array(userShowcaseSectionSchema).max(USER_SHOWCASE_SECTION_KEYS.length).optional(),
  links: z
    .array(userShowcaseLinkSchema)
    .max(MAX_USER_LINKS, `Vous ne pouvez pas ajouter plus de ${MAX_USER_LINKS} liens`)
    .optional(),
  showCity: z.boolean().optional(),
  playStyles: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

export type UserShowcaseInput = z.input<typeof userShowcaseSchema>;
export type UserShowcasePayload = z.output<typeof userShowcaseSchema>;

/**
 * L'identité, réglée dans le même écran mais **écrite ailleurs**.
 *
 * L'avatar, la description et la visibilité vivent à plat sur le compte et sont
 * déjà écrits par les actions existantes. Le formulaire les rassemble à
 * l'écran ; le schéma les garde distincts pour que la vitrine ne devienne pas
 * un chemin détourné vers le reste du document.
 */
export const userIdentitySchema = z.object({
  description: optionalText(500, "La description"),
  profileImage: optionalImageUrl,
});

export type UserIdentityInput = z.input<typeof userIdentitySchema>;
