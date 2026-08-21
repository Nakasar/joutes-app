import { z } from "zod";

import { PLAY_GROUP_ACCENT_PALETTE } from "@/lib/play-groups/theme";

export const playGroupGamesSchema = z.strictObject({
  /** `null` re-enables every game for the group; an array restricts it to those game ids. */
  enabledGameIds: z.array(z.string().min(1).max(100)).max(500).nullable(),
});

/**
 * Une image de personnalisation : une URL http(s), ou rien.
 *
 * La chaîne vide vaut « retirer », d'où le `transform` : un formulaire renvoie
 * toujours ses champs, et un champ vidé doit effacer la valeur plutôt que
 * d'échouer à la validation.
 */
const optionalImageUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => (value.length > 0 ? value : undefined))
  .refine((value) => value === undefined || /^https?:\/\//i.test(value), {
    message: "L'adresse doit commencer par http:// ou https://",
  })
  .optional();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional();

export const playGroupLinkSchema = z.object({
  type: z.enum(["website", "twitch", "youtube", "discord", "instagram", "facebook", "x", "other"]),
  url: z.string().trim().max(2048).regex(/^https?:\/\//i, "L'adresse doit commencer par http:// ou https://"),
  label: optionalText(60),
});

export const playGroupPlaceSchema = z.object({
  kind: z.enum(["joutes", "free", "member"]),
  lairId: optionalText(100),
  label: optionalText(120),
  detail: optionalText(240),
});

export const playGroupIdentitySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalText(500),
  logo: optionalImageUrl,
  banner: optionalImageUrl,
  /** La palette est fermée : un accent hors liste est refusé plutôt que corrigé. */
  accentColor: z
    .enum(PLAY_GROUP_ACCENT_PALETTE)
    .nullable()
    .optional(),
  tagline: optionalText(140),
  links: z.array(playGroupLinkSchema).max(8).default([]),
  rhythmLabel: optionalText(80),
  defaultPlace: playGroupPlaceSchema.optional(),
});

export const playGroupAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: optionalText(2000),
  scope: z.enum(["group", "public"]),
});

export const playGroupContentSchema = z
  .object({
    kind: z.enum(["video", "article", "replay"]),
    title: z.string().trim().min(1).max(140),
    summary: optionalText(300),
    /** Markdown de l'article. */
    body: optionalText(20000),
    url: z
      .string()
      .trim()
      .max(2048)
      .transform((value) => (value.length > 0 ? value : undefined))
      .refine((value) => value === undefined || /^https?:\/\//i.test(value), {
        message: "L'adresse doit commencer par http:// ou https://",
      })
      .optional(),
    thumbnail: optionalImageUrl,
    duration: optionalText(20),
    gameId: optionalText(100),
  })
  // Une vidéo ou un replay sans lien n'est rien à regarder ; un article sans
  // corps n'est rien à lire. Le contrôle est ici plutôt que dans le formulaire
  // pour que l'API le porte aussi.
  .refine((value) => value.kind === "article" || !!value.url, {
    message: "Une vidéo ou un replay demande son adresse",
    path: ["url"],
  })
  .refine((value) => value.kind !== "article" || !!value.body, {
    message: "Un article demande son texte",
    path: ["body"],
  });

export const playGroupSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(140),
    gameId: optionalText(100),
    place: playGroupPlaceSchema.optional(),
    /** ISO 8601 — la date d'une session confirmée. */
    startsAt: optionalText(40),
    endsAt: optionalText(40),
    /** Les créneaux d'un sondage de disponibilités. */
    slots: z.array(z.object({ startsAt: z.string().trim().min(1).max(40) })).max(8).default([]),
    pollClosesAt: optionalText(40),
  })
  .refine((value) => value.slots.length > 0 || !!value.startsAt, {
    message: "Une session demande soit une date, soit des créneaux à sonder",
    path: ["startsAt"],
  });

export const playGroupLiveSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  title: optionalText(140),
  gameId: optionalText(100),
});

export const playGroupRsvpSchema = z.object({
  answer: z.enum(["yes", "maybe", "no"]),
});
