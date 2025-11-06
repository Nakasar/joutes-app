import { z } from "zod";

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

export const lairSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(200, "Le nom est trop long"),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  games: z.array(objectIdSchema).default([]),
  eventsSourceUrls: z.array(z.url("Chaque URL doit être valide")).default([]),
  coordinates: z.object({
    latitude: z.number().min(-90, "La latitude doit être entre -90 et 90").max(90, "La latitude doit être entre -90 et 90"),
    longitude: z.number().min(-180, "La longitude doit être entre -180 et 180").max(180, "La longitude doit être entre -180 et 180"),
  }).optional(),
  address: z.string().max(500, "L'adresse est trop longue").optional(),
  website: z.url("L'URL du site web doit être valide").optional().or(z.literal("")),
});

export const lairIdSchema = objectIdSchema;

export type LairInput = z.infer<typeof lairSchema>;
