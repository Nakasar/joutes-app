import { z } from "zod";

import { externalUrl } from "@/lib/lairs/urls";
import { USER_CONTENT_KINDS } from "@/lib/types/UserContent";

/**
 * Ce qu'un joueur écrit quand il publie.
 *
 * Reprend `playGroupContentSchema` — mêmes bornes, mêmes contrôles croisés — et
 * lui ajoute la visibilité, qui n'existe pas côté groupe : un contenu de groupe
 * est publié *dans* le groupe, alors qu'un joueur a besoin de préparer un
 * article avant de le montrer.
 */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} est trop long`)
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional();

const optionalExternalUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => (value.length > 0 ? value : undefined))
  .refine((value) => value === undefined || externalUrl(value) !== null, {
    message: "L'adresse doit être en http(s)",
  })
  .optional();

export const userContentSchema = z
  .object({
    kind: z.enum(USER_CONTENT_KINDS),
    visibility: z.enum(["public", "private"]),
    title: z.string().trim().min(1, "Le titre est requis").max(140, "Le titre est trop long"),
    summary: optionalText(300, "Le résumé"),
    /** Markdown de l'article. */
    body: optionalText(20_000, "Le texte"),
    url: optionalExternalUrl,
    thumbnail: optionalExternalUrl,
    duration: optionalText(20, "La durée"),
    gameId: optionalText(100, "Le jeu"),
  })
  // Une vidéo ou un replay sans lien n'est rien à regarder ; un article sans
  // corps n'est rien à lire. Le contrôle est ici plutôt que dans le formulaire
  // pour que l'action serveur le porte aussi.
  .refine((value) => value.kind === "article" || !!value.url, {
    message: "Une vidéo ou un replay demande son adresse",
    path: ["url"],
  })
  .refine((value) => value.kind !== "article" || !!value.body, {
    message: "Un article demande son texte",
    path: ["body"],
  });

export type UserContentInput = z.input<typeof userContentSchema>;
export type UserContentPayload = z.output<typeof userContentSchema>;
