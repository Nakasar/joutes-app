import { z } from "zod";

// Schéma pour la création d'une clé API
export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Le nom de la clé API est requis")
    .max(100, "Le nom ne peut pas dépasser 100 caractères")
    .regex(
      /^[a-zA-Z0-9\s_-]+$/,
      "Le nom ne peut contenir que des lettres, chiffres, espaces, underscores (_) et tirets (-)"
    ),
  description: z
    .string()
    .max(500, "La description ne peut pas dépasser 500 caractères")
    .optional(),
});

// Schéma pour la mise à jour d'une clé API
export const updateApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Le nom de la clé API est requis")
    .max(100, "Le nom ne peut pas dépasser 100 caractères")
    .regex(
      /^[a-zA-Z0-9\s_-]+$/,
      "Le nom ne peut contenir que des lettres, chiffres, espaces, underscores (_) et tirets (-)"
    )
    .optional(),
  description: z
    .string()
    .max(500, "La description ne peut pas dépasser 500 caractères")
    .optional(),
  isActive: z.boolean().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;