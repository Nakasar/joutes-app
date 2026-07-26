import { z } from "zod";
import { isReservedCardKey } from "@/lib/constants/cards";

/** Valeur d'un attribut de jeu : texte, nombre, booléen ou liste de textes. */
export const cardAttributeValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
]);

/**
 * Les attributs sont écrits à la racine du document Mongo : leur nom doit donc
 * rester un nom de champ sain (ni `.`, ni `$` en tête, qui rendraient le
 * document difficile à requêter) et ne pas empiéter sur les champs communs,
 * qui ont leur propre saisie.
 */
export const cardAttributeKeySchema = z
  .string()
  // Pas de `.trim()` : la clé validée doit être exactement celle écrite en base,
  // sinon un « domain » entouré d'espaces passerait la validation et créerait un
  // champ Mongo difficile à requêter.
  .min(1, "Le nom d'un attribut est requis")
  .max(60, "Le nom d'un attribut est trop long")
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    "Un nom d'attribut doit commencer par une lettre et ne contenir que des lettres, chiffres et « _ »"
  )
  .refine((key) => !isReservedCardKey(key), {
    message: "ce nom est réservé aux champs communs de la carte",
  });

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
  attributes: z
    .record(z.string(), cardAttributeValueSchema)
    .optional()
    // Les clés sont validées ici plutôt que par `z.record(cardAttributeKeySchema, …)`,
    // qui remonterait un « Invalid key in record » sans dire laquelle ni pourquoi.
    .superRefine((attributes, ctx) => {
      for (const key of Object.keys(attributes ?? {})) {
        const result = cardAttributeKeySchema.safeParse(key);
        if (!result.success) {
          ctx.addIssue({
            code: "custom",
            message: `Attribut « ${key} » : ${result.error.issues[0]?.message}`,
            path: [key],
          });
        }
      }
    }),
});

export type CardInput = z.infer<typeof cardSchema>;
