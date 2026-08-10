import { z } from "zod";
import { PRODUCT_KIND_KEYS } from "@/lib/constants/product-kinds";
import { cardAttributeKeySchema, cardAttributeValueSchema } from "@/lib/schemas/card.schema";

export const productKindSchema = z.enum(PRODUCT_KIND_KEYS);

/**
 * Un produit référence les autres par leur identifiant de catalogue. Le même
 * identifiant ne figure qu'une fois : les doublons sont fusionnés à la saisie
 * (quantités additionnées) plutôt que refusés, une liste collée en contient
 * souvent.
 */
export const productIdSchema = z
  .string()
  .trim()
  .min(1, "L'identifiant du produit est requis")
  .max(64, "L'identifiant est trop long")
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "L'identifiant ne peut contenir que lettres, chiffres, « - », « _ » et « . »"
  );

export const productContentSchema = z.object({
  productId: productIdSchema,
  quantity: z
    .number()
    .int("La quantité doit être un nombre entier")
    .min(1, "La quantité doit valoir au moins 1")
    .max(99, "La quantité est trop grande"),
});

/** Plafond de lignes de contenu, partagé par le formulaire et la validation. */
export const MAX_PRODUCT_CONTENTS = 60;

export const productSchema = z.object({
  id: productIdSchema,
  name: z.string().trim().min(1, "Le nom du produit est requis").max(200, "Le nom est trop long"),
  kind: productKindSchema,
  image: z.union([z.url("L'URL de l'image doit être valide"), z.literal("")]).optional(),
  setCode: z.string().trim().max(20, "Le code de gamme est trop long").optional(),
  contents: z
    .array(productContentSchema)
    .max(MAX_PRODUCT_CONTENTS, `Un produit ne peut pas contenir plus de ${MAX_PRODUCT_CONTENTS} références`)
    .optional(),
  // Les attributs sont imbriqués sous `attributes`, là où ceux d'une carte sont
  // écrits à la racine du document : sur un catalogue neuf, plus besoin de
  // défendre une liste de champs réservés, et leur relevé est un simple
  // `$objectToArray: "$attributes"`.
  attributes: z
    .record(z.string(), cardAttributeValueSchema)
    .optional()
    // Validées ici plutôt que par `z.record(cardAttributeKeySchema, …)`, qui
    // remonterait un « Invalid key in record » sans dire laquelle ni pourquoi.
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

export type ProductInput = z.infer<typeof productSchema>;
