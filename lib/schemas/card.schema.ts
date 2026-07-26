import { z } from "zod";

/** Valeur d'un attribut de jeu : texte, nombre, booléen ou liste de textes. */
export const cardAttributeValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
]);

export const cardSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "L'identifiant de la carte est requis")
    .max(64, "L'identifiant est trop long")
    .regex(/^[A-Za-z0-9*._-]+$/, "L'identifiant ne peut contenir que lettres, chiffres, `-`, `_`, `.` et `*`"),
  name: z.string().trim().min(1, "Le nom de la carte est requis").max(200, "Le nom est trop long"),
  setCode: z.string().trim().min(1, "Le code d'extension est requis").max(20, "Le code d'extension est trop long"),
  collectorNumber: z
    .string()
    .trim()
    .min(1, "Le numéro de collection est requis")
    .max(20, "Le numéro de collection est trop long"),
  lang: z.string().trim().min(2, "La langue est requise").max(5, "La langue est trop longue"),
  image: z.union([z.url("L'URL de l'image doit être valide"), z.literal("")]).optional(),
  text: z.string().max(5000, "Le texte de la carte est trop long").optional(),
  attributes: z.record(z.string().min(1).max(60), cardAttributeValueSchema).optional(),
});

export type CardInput = z.infer<typeof cardSchema>;
