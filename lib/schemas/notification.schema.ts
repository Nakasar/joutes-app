import { z } from "zod";

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

// Schéma pour les notifications envoyées à un utilisateur spécifique
const userNotificationTargetSchema = z.object({
  type: z.literal('user'),
  userId: objectIdSchema,
});

// Schéma pour les notifications envoyées à un lair
const lairNotificationTargetSchema = z.object({
  type: z.literal('lair'),
  lairId: objectIdSchema,
  target: z.enum(['owners', 'followers', 'all']),
});

// Schéma pour les notifications envoyées à un événement
const eventNotificationTargetSchema = z.object({
  type: z.literal('event'),
  eventId: objectIdSchema,
  target: z.enum(['participants', 'creator', 'all']),
});

// Union des différents types de notifications
const notificationTargetSchema = z.discriminatedUnion('type', [
  userNotificationTargetSchema,
  lairNotificationTargetSchema,
  eventNotificationTargetSchema,
]);

export const notificationSchema = z.object({
  id: z.string().min(1, "L'ID est requis"),
  title: z.string().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  description: z.string().min(1, "La description est requise").max(1000, "La description est trop longue"),
  createdAt: z.string().datetime("La date d'émission doit être au format ISO 8601"),
  // Champs optionnels pour marquer comme lu
  readBy: z.array(z.string()).optional(),
}).and(notificationTargetSchema);

export const notificationIdSchema = z.string().min(1, "L'ID de la notification est requis");

export type NotificationInput = z.infer<typeof notificationSchema>;
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;
