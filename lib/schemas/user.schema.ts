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
