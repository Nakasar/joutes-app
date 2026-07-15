import { z } from "zod";
import { cardCondition, collectionCurrency, collectionLanguage } from "@/lib/schemas/collection.schema";

export const sellListSchema = z.object({
  description: z.string().max(2000, "La description est trop longue").optional(),
});

export const sellListUpdateSchema = z.object({
  description: z.string().max(2000, "La description est trop longue").optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export const sellListItemSchema = z.strictObject({
  collectionEntryId: z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID de l'entrée de collection doit être un ObjectId MongoDB valide"),
  gameSlug: z.string().min(1).max(100),
  price: z.number().min(0).max(1000000).optional(),
  currency: collectionCurrency.optional(),
  note: z.string().max(300).optional(),
}).refine(
  (data) => data.price === undefined || data.currency !== undefined,
  { message: "La devise est requise si un prix est indiqué", path: ["currency"] }
);

export const sellListItemUpdateSchema = z.strictObject({
  // `null` efface le prix existant (la carte reste en vente, sans prix indiqué) ; absent = inchangé.
  price: z.number().min(0).max(1000000).nullable().optional(),
  currency: collectionCurrency.optional(),
  note: z.string().max(300).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
).refine(
  (data) => !(typeof data.price === "number" && data.currency === undefined),
  { message: "La devise est requise si un prix est indiqué", path: ["currency"] }
);

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const sellListIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID de la liste de vente doit être un ObjectId MongoDB valide");

export type SellListInput = z.infer<typeof sellListSchema>;
export type SellListUpdateInput = z.infer<typeof sellListUpdateSchema>;
export type SellListItemInput = z.infer<typeof sellListItemSchema>;
export type SellListItemUpdateInput = z.infer<typeof sellListItemUpdateSchema>;

export { cardCondition, collectionLanguage, collectionCurrency };
