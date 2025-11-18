import { z } from "zod";

// Schéma pour le nom d'utilisateur (displayName)
// Le nom d'utilisateur doit contenir uniquement des lettres, chiffres, underscores et tirets
// Il doit faire entre 3 et 20 caractères
export const displayNameSchema = z
  .string()
  .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
  .max(20, "Le nom d'utilisateur ne peut pas dépasser 20 caractères")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, underscores (_) et tirets (-)"
  );

// Schéma pour le discriminateur (nombre à 4 chiffres)
export const discriminatorSchema = z
  .string()
  .regex(/^\d{4}$/, "Le discriminateur doit être un nombre à 4 chiffres");

// Schéma pour la mise à jour du nom d'utilisateur
export const updateDisplayNameSchema = z.object({
  displayName: displayNameSchema,
});

export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;

// Schéma pour la mise à jour de la visibilité du profil
export const updateProfileVisibilitySchema = z.object({
  isPublicProfile: z.boolean(),
});

export type UpdateProfileVisibilityInput = z.infer<typeof updateProfileVisibilitySchema>;

// Schéma pour la description du profil
export const descriptionSchema = z
  .string()
  .max(500, "La description ne peut pas dépasser 500 caractères")
  .optional();

// Schéma pour le site web
export const websiteSchema = z
  .string()
  .url("L'URL du site web n'est pas valide")
  .optional()
  .or(z.literal(""));

// Schéma pour un lien de réseau social
export const socialLinkSchema = z
  .string()
  .url("L'URL n'est pas valide");

// Schéma pour la mise à jour des informations du profil
export const updateProfileInfoSchema = z.object({
  description: descriptionSchema,
  website: websiteSchema,
  socialLinks: z.array(socialLinkSchema).max(10, "Vous ne pouvez pas ajouter plus de 10 liens").optional(),
});

export type UpdateProfileInfoInput = z.infer<typeof updateProfileInfoSchema>;

// Schéma pour la mise à jour de l'image de profil
export const updateProfileImageSchema = z.object({
  profileImage: z.string().url("L'URL de l'image n'est pas valide"),
});

export type UpdateProfileImageInput = z.infer<typeof updateProfileImageSchema>;
