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
  id: z.string().optional(),
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
  eventsBaseUrl: z.string().url("L'URL de base des événements doit être valide").optional(),
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

/**
 * Les seuls champs que l'onglet « Détails » de la gestion d'un lieu envoie.
 *
 * Un schéma à part, et non `lairSchema.omit(...)`, pour deux raisons.
 *
 * D'abord parce que `.omit()` **lève** : Zod refuse de l'appliquer à un objet
 * portant des refinements, ce que `lairSchema` fait depuis son `superRefine`.
 * L'appel partait donc en exception à chaque enregistrement, attrapée par le
 * `catch` de l'action — l'onglet ne sauvegardait plus rien du tout, en
 * annonçant une panne générique.
 *
 * Ensuite parce que réutiliser `lairSchema` aurait réintroduit ses valeurs par
 * défaut dans la charge écrite : `isPrivate` serait retombé à `false` — un lieu
 * privé redevenu public en enregistrant son nom — et `eventsSourceUrls` à `[]`.
 * Ce que le formulaire n'envoie pas ne doit pas être réécrit.
 */
export const lairDetailsSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(200, "Le nom est trop long"),
  banner: z.url("L'URL de la bannière doit être valide").optional(),
  games: z.array(objectIdSchema).default([]),
  location: geoJSONPointSchema,
  address: z.string().max(500, "L'adresse est trop longue").optional(),
  website: z.url("L'URL du site web doit être valide").optional().or(z.literal("")),
});

export const lairIdSchema = objectIdSchema;

export type LairInput = z.infer<typeof lairSchema>;

/**
 * Ce qu'un joueur envoie pour ouvrir un lieu, public ou privé.
 *
 * Un schéma à part de `lairSchema`, qui décrit ce que l'administration écrit :
 * la création par un compte ordinaire ne touche ni aux sources d'événements, ni
 * à la bannière, ni aux jeux — ce sont des champs de l'écran de gestion, et les
 * accepter ici les rendrait écrivables par la seule requête de création.
 *
 * La localisation arrive en latitude / longitude, dans l'ordre où le champ de
 * recherche de localité la rend ; c'est `toLairLocation` qui la retourne en
 * GeoJSON. Faire porter l'inversion au client aurait mis l'erreur la plus facile
 * à commettre du côté que le serveur ne contrôle pas.
 *
 * Les deux exigences propres au public — une adresse et un point sur la carte —
 * ne sont pas de la paperasse : sans elles, le lieu n'est trouvable ni dans
 * l'annuaire, ni par la recherche autour de soi, c'est-à-dire nulle part.
 */
export const lairCreationSchema = z.object({
  name: z.string().trim().min(1, "Le nom du lieu est requis").max(200, "Le nom est trop long"),
  visibility: z.enum(["public", "private"]),
  address: z.string().trim().max(500, "L'adresse est trop longue").optional(),
  website: z.url("L'URL du site web doit être valide").optional(),
  location: z
    .object({
      latitude: z.number().min(-90, "La latitude doit être entre -90 et 90").max(90, "La latitude doit être entre -90 et 90"),
      longitude: z.number().min(-180, "La longitude doit être entre -180 et 180").max(180, "La longitude doit être entre -180 et 180"),
    })
    .optional(),
}).superRefine((data, ctx) => {
  if (data.visibility !== "public") {
    return;
  }

  if (!data.address) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Un lieu public doit indiquer son adresse",
      path: ["address"],
    });
  }

  if (!data.location) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Un lieu public doit être situé sur la carte",
      path: ["location"],
    });
  }
});

export type LairCreationInput = z.infer<typeof lairCreationSchema>;
