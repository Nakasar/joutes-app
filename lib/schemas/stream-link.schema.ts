import { z } from "zod";

/**
 * Ce qui arrive d'un écran vers les actions de liaison de direct.
 *
 * Une destination, et rien d'autre : le reste — la chaîne, l'abonnement, le
 * direct en cours — vient des plateformes ou de la session, jamais du
 * navigateur. Un identifiant de lieu est un ObjectId Mongo ; celui d'un groupe
 * de jeu est une chaîne courte que le groupe se choisit, d'où les deux formes.
 */

export const streamPlatformSchema = z.enum(["twitch", "youtube"]);

export const streamTargetSchema = z.object({
  kind: z.enum(["lair", "play-group"]),
  id: z.string().trim().min(1).max(64),
});

export type StreamTargetInput = z.infer<typeof streamTargetSchema>;
