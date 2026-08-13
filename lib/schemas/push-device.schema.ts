import { z } from "zod";

/**
 * Ce qu'un appareil déclare en s'enregistrant.
 *
 * Le contrôle sur la forme du jeton iOS n'est pas de la coquetterie : un jeton
 * APNs est une chaîne hexadécimale, et l'y contraindre attrape sur-le-champ
 * l'erreur la plus fréquente de l'intégration mobile — envoyer la description
 * de l'objet `Data` de Swift (`<a1b2 c3d4 …>`) au lieu de sa conversion. Le
 * fournisseur, lui, ne répondrait qu'un `BadDeviceToken` bien plus tard.
 */

export const registerPushDeviceSchema = z
  .object({
    platform: z.enum(["ios", "android"]),
    token: z.string().min(32).max(4096),
    installationId: z.string().min(8).max(128),
    environment: z.enum(["production", "sandbox"]).optional(),
    locale: z.enum(["fr", "en", "de", "it"]).optional(),
    appVersion: z.string().max(32).optional(),
  })
  .refine(
    (device) => device.platform !== "ios" || /^[0-9a-f]+$/i.test(device.token),
    { message: "Un jeton APNs est une chaîne hexadécimale", path: ["token"] }
  );

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;

/** Pagination de la liste des notifications. */
export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
