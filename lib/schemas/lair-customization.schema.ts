import { z } from "zod";

import { LAIR_ACCENT_PALETTE } from "@/lib/lairs/theme";
import { LAIR_SECTION_KEYS } from "@/lib/lairs/sections";
import { externalUrl } from "@/lib/lairs/urls";
import { findOverlappingDay, isoDay, MAX_OPENING_RANGES_PER_DAY } from "@/lib/lairs/opening-hours";

/**
 * Ce qu'un lieu peut écrire sur sa propre vitrine.
 *
 * Séparé de `lairSchema` à dessein : celui-ci décrit le lieu tel que
 * l'administration le manipule (nom, jeux, sources d'événements), et son
 * `options` ne connaît que le calendrier. Les faire cohabiter obligerait le
 * formulaire de personnalisation à renvoyer le lieu entier — donc à pouvoir
 * réécrire son nom et ses propriétaires pour changer une couleur.
 */

/**
 * Une URL saisie par le lieu.
 *
 * `url()` seul accepte `javascript:` et `data:` : ces valeurs finissent dans
 * des `href` et des `src` sur la page publique. Le refus est posé ici, à
 * l'écriture, en plus du filtre au rendu — les deux se justifient, l'un
 * protège les données à venir, l'autre celles déjà en base.
 *
 * Le contrôle délègue à `externalUrl`, qui porte déjà la règle du dépôt **et**
 * la garde qu'un `refine` seul n'a pas : en Zod, l'échec de `.url()` ne coupe
 * pas la chaîne, le raffinement suivant s'exécute quand même. Un `new URL()`
 * nu y rencontrait donc les valeurs que `.url()` venait de rejeter — une
 * chaîne vide, un `instagram.com/joutes` sans schéma — et **levait** au lieu
 * de refuser, faisant remonter une `TypeError` jusqu'à l'action serveur.
 */
const externalUrlSchema = z
  .string()
  .trim()
  .refine((value) => externalUrl(value) !== null, "L'URL doit être une adresse http(s) valide");

/** Une chaîne facultative : le vide vaut « non renseigné », pas « chaîne vide ». */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} est trop long`)
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional();

const optionalUrl = z
  .union([externalUrlSchema, z.literal("")])
  .transform((value) => (value ? value : undefined))
  .optional();

/** "10:00" — l'heure telle que la saisit un `<input type="time">`. */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L'heure doit être au format HH:MM");

export const lairThemeSchema = z.object({
  logo: optionalUrl,
  // La palette est fermée : cinq accents vérifiés contre le fond sombre. Une
  // valeur libre finirait tôt ou tard sur un gris invisible ou un ton qui rend
  // le texte des boutons illisible.
  accentColor: z
    .union([z.enum(LAIR_ACCENT_PALETTE), z.literal("")])
    .transform((value) => (value ? value : undefined))
    .optional(),
  tintSurfaces: z.boolean().optional(),
});

export const lairLinkSchema = z.object({
  type: z.enum(["website", "instagram", "facebook", "discord", "twitch", "youtube", "x", "other"]),
  url: externalUrlSchema,
  label: optionalText(80, "Le libellé"),
});

export const lairNewsItemSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  summary: optionalText(500, "Le résumé"),
  content: optionalText(10_000, "Le contenu"),
  category: optionalText(40, "La catégorie"),
  banner: optionalUrl,
  publishedAt: z.string().datetime({ offset: true }),
  pinned: z.boolean().optional(),
  link: optionalUrl,
  linkLabel: optionalText(80, "Le libellé du lien"),
});

export const lairOpeningHoursSchema = z
  .object({
    // `0` reste accepté en entrée : c'est le dimanche des horaires écrits avant
    // que la numérotation ISO soit fixée. Il est ramené sur `7` ici, pour que la
    // base ne porte qu'une seule numérotation.
    day: z.number().int().min(0).max(7).transform(isoDay),
    open: timeSchema.optional(),
    close: timeSchema.optional(),
  })
  // Une seule des deux bornes ne décrit rien : soit le jour a des horaires,
  // soit il est fermé.
  .refine(
    (value) => (value.open === undefined) === (value.close === undefined),
    "Renseignez l'ouverture et la fermeture, ou aucune des deux"
  );

/**
 * Les horaires de la semaine, plages coupées comprises.
 *
 * Un jour peut porter plusieurs plages — « 10h — 12h » puis « 14h — 19h » —, si
 * bien que la liste n'est plus bornée à sept lignes : c'est le nombre de plages
 * *par jour* qui l'est.
 */
export const lairOpeningHoursCollectionSchema = z
  .array(lairOpeningHoursSchema)
  .max(7 * MAX_OPENING_RANGES_PER_DAY, "Trop de plages horaires")
  .refine((hours) => {
    const perDay = new Map<number, number>();
    for (const entry of hours) {
      perDay.set(entry.day, (perDay.get(entry.day) ?? 0) + 1);
    }

    return [...perDay.values()].every((count) => count <= MAX_OPENING_RANGES_PER_DAY);
  }, `${MAX_OPENING_RANGES_PER_DAY} plages par jour au maximum`)
  .refine(
    (hours) => findOverlappingDay(hours) === null,
    "Les plages d'un même jour ne peuvent pas se chevaucher"
  );

export const lairAboutSchema = z.object({
  description: optionalText(5_000, "La présentation"),
  category: optionalText(80, "Le type de lieu"),
  amenities: z.array(z.string().trim().min(1).max(60)).max(12, "12 équipements au maximum").optional(),
  photos: z.array(externalUrlSchema).max(4, "4 photos au maximum").optional(),
  videoUrl: optionalUrl,
  transit: optionalText(200, "L'accès en transports"),
  parking: optionalText(200, "Le stationnement"),
  organizers: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Le nom est requis").max(80, "Le nom est trop long"),
        role: optionalText(80, "Le rôle"),
        avatar: optionalUrl,
      })
    )
    .max(8, "8 organisateurs au maximum")
    .optional(),
  rhythm: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().min(1).max(60),
      })
    )
    .max(6, "6 lignes au maximum")
    .optional(),
});

export const lairSectionSchema = z.object({
  key: z.enum(LAIR_SECTION_KEYS),
  enabled: z.boolean(),
});

/** Le corps complet du formulaire de personnalisation. */
export const lairCustomizationSchema = z.object({
  theme: lairThemeSchema.optional(),
  sections: z.array(lairSectionSchema).max(LAIR_SECTION_KEYS.length).optional(),
  links: z.array(lairLinkSchema).max(6, "6 liens au maximum").optional(),
  contact: z
    .object({
      phone: optionalText(40, "Le téléphone"),
      email: z
        .union([z.string().trim().email("L'adresse e-mail doit être valide"), z.literal("")])
        .transform((value) => (value ? value : undefined))
        .optional(),
    })
    .optional(),
  openingHours: lairOpeningHoursCollectionSchema.optional(),
  about: lairAboutSchema.optional(),
  // Les événements ne portent pas d'ObjectId : ils sont créés en `nanoid(12)`
  // ou en `crypto.randomUUID()` selon le chemin. Le gabarit couvre les deux —
  // et l'ObjectId, pour les documents les plus anciens.
  featuredEventId: z
    .union([
      z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "L'identifiant d'événement est invalide"),
      z.literal(""),
    ])
    .transform((value) => (value ? value : undefined))
    .optional(),
});

export const lairNewsCollectionSchema = z
  .array(lairNewsItemSchema)
  .max(30, "30 actualités au maximum")
  // Une seule annonce peut être épinglée : deux « en tête » n'ont plus de tête.
  .refine(
    (items) => items.filter((item) => item.pinned).length <= 1,
    "Une seule actualité peut être épinglée"
  );

export type LairCustomizationInput = z.input<typeof lairCustomizationSchema>;
export type LairCustomizationPayload = z.output<typeof lairCustomizationSchema>;
