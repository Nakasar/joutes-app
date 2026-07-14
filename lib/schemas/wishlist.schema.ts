import { z } from "zod";

export const wishlistVisibilitySchema = z.enum(["private", "unlisted", "public"]);

export const wishlistSchema = z.object({
  name: z.string().min(1, "Le nom de la liste de souhaits est requis").max(100, "Le nom est trop long"),
  description: z.string().max(2000, "La description est trop longue").optional(),
  visibility: wishlistVisibilitySchema.default("private"),
});

export const wishlistUpdateSchema = z.object({
  name: z.string().min(1, "Le nom de la liste de souhaits est requis").max(100, "Le nom est trop long").optional(),
  description: z.string().max(2000, "La description est trop longue").optional(),
  visibility: wishlistVisibilitySchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export const wishlistItemSchema = z.strictObject({
  cardId: z.string().min(1).max(100),
  gameSlug: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  setCode: z.string().min(1).max(100),
  collectorNumber: z.string().min(1).max(100),
  image: z.string(),
  type: z.string().optional(),
  quantity: z.number().min(1).max(99).optional(),
  note: z.string().max(300).optional(),
});

export const wishlistItemUpdateSchema = z.strictObject({
  quantity: z.number().min(1).max(99).optional(),
  note: z.string().max(300).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
export const wishlistIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID de la liste de souhaits doit être un ObjectId MongoDB valide");

export type WishlistInput = z.infer<typeof wishlistSchema>;
export type WishlistUpdateInput = z.infer<typeof wishlistUpdateSchema>;
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;
export type WishlistItemUpdateInput = z.infer<typeof wishlistItemUpdateSchema>;
