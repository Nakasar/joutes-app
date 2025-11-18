import { z } from "zod";

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

export const eventSchema = z.object({
  id: z.string().min(1, "L'ID est requis"),
  lairId: objectIdSchema.optional(),
  name: z.string().min(1, "Le nom de l'événement est requis").max(500, "Le nom est trop long"),
  startDateTime: z.string().datetime("La date de début doit être au format ISO 8601"),
  endDateTime: z.string().datetime("La date de fin doit être au format ISO 8601"),
  gameName: z.string().min(1, "Le nom du jeu est requis").max(200, "Le nom du jeu est trop long"),
  url: z.string().url("L'URL doit être valide").optional(),
  price: z.number().min(0, "Le prix doit être positif").optional(),
  status: z.enum(['available', 'sold-out', 'cancelled']),
  addedBy: z.string().min(1, "L'auteur de l'événement est requis"),
  participants: z.array(z.string()).optional(),
  maxParticipants: z.number().min(1, "Le nombre maximum de participants doit être positif").optional(),
});

export const eventIdSchema = z.string().min(1, "L'ID de l'événement est requis");

export type EventInput = z.infer<typeof eventSchema>;
