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

// Schéma pour le mapping des champs d'événements
const eventFieldsMappingSchema = z.object({
  name: z.string().optional(),
  startDateTime: z.string().optional(),
  endDateTime: z.string().optional(),
  gameName: z.string().optional(),
  price: z.string().optional(),
  status: z.string().optional(),
  url: z.string().optional(),
});

// Schéma pour les valeurs par défaut des champs
const eventFieldsValuesSchema = z.object({
  name: z.string().optional(),
  startDateTime: z.string().optional(),
  endDateTime: z.string().optional(),
  gameName: z.string().optional(),
  price: z.number().optional(),
  status: z.enum(['available', 'sold-out', 'cancelled']).optional(),
  url: z.string().optional(),
});

// Schéma pour la configuration de mapping JSON
const eventMappingConfigSchema = z.object({
  eventsPath: z.string().min(1, "Le chemin vers les événements est requis"),
  eventsFieldsMapping: eventFieldsMappingSchema,
  eventsFieldsValues: eventFieldsValuesSchema.optional(),
});

// Schéma pour une source d'événements
const eventSourceSchema = z.object({
  url: z.string().url("L'URL doit être valide"),
  type: z.enum(['IA', 'MAPPING']),
  instructions: z.string().max(2000, "Les consignes sont trop longues").optional(),
  mappingConfig: eventMappingConfigSchema.optional(),
}).superRefine((data, ctx) => {
  // Si le type est MAPPING, mappingConfig est obligatoire
  if (data.type === 'MAPPING' && !data.mappingConfig) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La configuration de mapping est requise pour le type MAPPING",
      path: ["mappingConfig"],
    });
  }
});

export const lairSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(200, "Le nom est trop long"),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  games: z.array(objectIdSchema).default([]),
  eventsSourceUrls: z.array(eventSourceSchema).default([]),
  eventsSourceInstructions: z.string().max(2000, "Les consignes sont trop longues").optional(),
  location: geoJSONPointSchema,
  address: z.string().max(500, "L'adresse est trop longue").optional(),
  website: z.url("L'URL du site web doit être valide").optional().or(z.literal("")),
  isPrivate: z.boolean().default(false),
  invitationCode: z.string().optional(),
  options: z.object({
    calendar: z.object({
      mode: z.enum(['CALENDAR', 'AGENDA', 'CONFERENCE']).optional(),
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
