import { z } from "zod";

// Pour la validation d'ID MongoDB (ObjectId est un string hexadecimal de 24 caractères)
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");

// Schéma pour un point GeoJSON
const geoJSONPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().min(-180, "La longitude doit être entre -180 et 180").max(180, "La longitude doit être entre -180 et 180"),
    z.number().min(-90, "La latitude doit être entre -90 et 90").max(90, "La latitude doit être entre -90 et 90"),
  ]),
}).optional();

export const lairSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(200, "Le nom est trop long"),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  games: z.array(objectIdSchema).default([]),
  eventsSourceUrls: z.array(z.url("Chaque URL doit être valide")).default([]),
  eventsSourceInstructions: z.string().max(2000, "Les consignes sont trop longues").optional(),
  location: geoJSONPointSchema,
  address: z.string().max(500, "L'adresse est trop longue").optional(),
  website: z.url("L'URL du site web doit être valide").optional().or(z.literal("")),
  isPrivate: z.boolean().default(false),
  invitationCode: z.string().optional(),
  options: z.object({
    calendar: z.object({
      mode: z.enum(['CALENDAR', 'AGENDA']).optional(),
    }).optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  // Les lairs privés ne peuvent pas avoir d'URL de scraping
  if (data.isPrivate && data.eventsSourceUrls && data.eventsSourceUrls.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Les lieux privés ne peuvent pas avoir d'URL de scraping d'événements",
      path: ["eventsSourceUrls"],
    });
  }
  // Les lairs privés ne peuvent pas avoir de bannière
  if (data.isPrivate && data.banner) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Les lieux privés ne peuvent pas avoir de bannière",
      path: ["banner"],
    });
  }
});

export const lairIdSchema = objectIdSchema;

export type LairInput = z.infer<typeof lairSchema>;
