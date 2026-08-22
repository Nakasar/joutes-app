import { z } from "zod";

/**
 * Ce qui arrive d'un écran vers les actions de liaison de direct.
 *
 * Une destination, et rien d'autre : le reste — la chaîne, l'abonnement, le
 * direct en cours — vient des plateformes ou de la session, jamais du
 * navigateur. Un identifiant de lieu est un ObjectId Mongo ; celui d'un groupe
 * de jeu est une chaîne courte que le groupe se choisit, d'où les deux formes.
 * Celui d'un profil est l'identifiant du compte lui-même, et `canAnnounceOn`
 * vérifie qu'il s'agit bien de celui de la session — sans quoi la destination
 * « profil » permettrait d'annoncer sur celui de quelqu'un d'autre.
 */

export const streamPlatformSchema = z.enum(["twitch", "youtube"]);

export const streamTargetSchema = z.object({
  kind: z.enum(["lair", "play-group", "user"]),
  id: z.string().trim().min(1).max(64),
});

export type StreamTargetInput = z.infer<typeof streamTargetSchema>;
