"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";

import { requireAdminOrOwner } from "@/lib/middleware/admin.ts";
import {
  eventsRefreshFrequencySchema,
  eventsSourceHelpRequestSchema,
  lairIdSchema,
  managerEventSettingsSchema,
  managerEventSourceSchema,
} from "@/lib/schemas/lair.schema.ts";
import * as lairsDb from "@/lib/db/lairs.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { lairHasPro } from "@/lib/subscriptions/access.ts";
import { previewEventSource, refreshEvents } from "@/lib/services/refresh-events.ts";
import { notifyTeamOfSourceRequest } from "@/lib/services/event-source-requests.ts";
import {
  buildManagerSource,
  describePreset,
  findManagerSource,
  findPresetByKey,
  findPresetForUrl,
  presetAsksVenues,
  summarizeGames,
  type GameSummary,
  type ManagerSourceInput,
  type RecognizedSite,
  type RefreshFrequency,
} from "@/lib/events/connect.ts";
import { EVENTS_TIMEZONE } from "@/lib/events/source-events.ts";
import type { EventSource, LairEventsRefreshReport } from "@/lib/types/Lair.ts";

/**
 * Les actions de l'onglet « Événements » de l'écran de gestion.
 *
 * Ce qu'un gérant peut faire de ses sources, et rien de plus : connecter la
 * page de son site si Joutes la reconnaît, choisir ses villes, ses jeux et
 * son rythme, relire, déconnecter, ou demander l'aide de l'équipe. Il ne
 * touche qu'à **sa** source (`managedBy: "owner"`) ; celles que l'équipe a
 * configurées, et le mode IA, restent l'affaire de l'administration.
 *
 * Les échecs sont des codes : le formulaire les traduit dans sa langue.
 */
export type EventsConnectError =
  | "INVALID"
  | "NOT_FOUND"
  | "PRIVATE"
  | "UNKNOWN_SITE"
  | "VENUES_REQUIRED"
  | "PRO_REQUIRED"
  | "READ_FAILED"
  | "NOTHING_CONNECTED"
  | "FAILED";

type Failure = { success: false; error: EventsConnectError; message?: string };

/** Un événement tel que l'aperçu le montre au gérant. */
export type PreviewedEvent = {
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  price?: number;
  status: string;
};

/** Ce qu'une lecture d'essai rend au gérant : de quoi vérifier avant d'activer. */
export type EventPagePreview = {
  count: number;
  events: PreviewedEvent[];
  games: GameSummary[];
  venues?: { available: string[]; counts: Record<string, number> };
  warnings: string[];
  lastDate: string | null;
};

/** Ce que l'écran connecté affiche après une lecture. */
export type ConnectionState = {
  source: EventSource;
  frequency: RefreshFrequency;
  report: LairEventsRefreshReport | null;
};

/** Combien d'événements l'aperçu transporte au plus : les plus proches d'abord. */
const PREVIEW_EVENTS_LIMIT = 60;

function revalidateLair(id: string) {
  revalidatePath(`/lairs/${id}`);
  revalidatePath(`/lairs/${id}/manage`);
  revalidatePath(`/admin/lairs/${id}`);
  revalidatePath("/events");
}

async function guard(lairId: string) {
  const session = await requireAdminOrOwner(lairId);
  const validatedId = lairIdSchema.parse(lairId);
  const lair = await lairsDb.getLairById(validatedId);
  return { session, lair, validatedId };
}

/**
 * Joutes sait-il lire cette page ?
 *
 * Rien n'est lu ici : la réponse tient au domaine. C'est ce qui fait que le
 * gérant a une réponse aussitôt collée l'adresse, et qu'un site inconnu ne
 * l'engage dans aucune étape.
 */
export async function recognizeEventPage(
  lairId: string,
  url: string,
): Promise<{ success: true; site: RecognizedSite | null } | Failure> {
  try {
    const { lair } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };

    const parsed = z.string().trim().url().safeParse(url);
    if (!parsed.success) return { success: false, error: "INVALID" };

    const preset = findPresetForUrl(parsed.data);
    return { success: true, site: preset ? describePreset(preset) : null };
  } catch (error) {
    console.error("Erreur à la reconnaissance d'une page d'événements :", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Lit la page telle que le gérant la décrit, sans rien écrire.
 *
 * `probeVenues` : lire sans ville cochée, pour proposer celles que la page
 * sait servir avec le nombre d'événements de chacune — l'étape « Vos
 * villes ». Sinon, la lecture est celle que la connexion fera.
 */
export async function previewEventPage(
  lairId: string,
  input: ManagerSourceInput,
  { probeVenues = false }: { probeVenues?: boolean } = {},
): Promise<{ success: true; preview: EventPagePreview } | Failure> {
  try {
    const { lair } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };
    if (lair.isPrivate) return { success: false, error: "PRIVATE" };

    const parsed = managerEventSourceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "INVALID" };

    const preset = findPresetByKey(parsed.data.presetKey);
    if (!preset || findPresetForUrl(parsed.data.url)?.key !== preset.key) {
      return { success: false, error: "UNKNOWN_SITE" };
    }

    const source = buildManagerSource(parsed.data, preset);
    if (probeVenues && source.htmlConfig) {
      // Sonder, c'est lire sans ville : le préréglage en coche une par défaut,
      // et la garder n'aurait montré qu'elle.
      delete source.htmlConfig.venues;
    }

    const read = await previewEventSource(lair, source);
    if (!read.ok) {
      return { success: false, error: "READ_FAILED", ...(read.error ? { message: read.error } : {}) };
    }

    const games = await readAllGames();
    const sorted = [...read.events].sort((left, right) => left.startDateTime.localeCompare(right.startDateTime));

    return {
      success: true,
      preview: {
        count: read.events.length,
        events: sorted.slice(0, PREVIEW_EVENTS_LIMIT).map((event) => ({
          name: event.name,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          gameName: event.gameName,
          ...(event.price !== undefined ? { price: event.price } : {}),
          status: event.status,
        })),
        games: summarizeGames(read.events, games, source.gameAliases),
        ...(read.venues ? { venues: read.venues } : {}),
        warnings: read.warnings,
        lastDate: sorted.length > 0 ? sorted[sorted.length - 1].startDateTime : null,
      },
    };
  } catch (error) {
    console.error("Erreur à la lecture d'essai d'une page d'événements :", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Connecte la page : enregistre la source du gérant, son rythme, et lit une
 * première fois.
 *
 * La source remplace celle qu'il avait connectée, s'il en avait une, et ne
 * touche pas aux autres. Le rythme quotidien demande Joutes Pro : le refus
 * est ici, pas seulement dans le formulaire, un bouton grisé ne protégeant
 * rien.
 */
export async function connectEventPage(
  lairId: string,
  input: ManagerSourceInput,
  frequency: RefreshFrequency,
): Promise<{ success: true; state: ConnectionState } | Failure> {
  try {
    const { lair, validatedId } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };
    if (lair.isPrivate) return { success: false, error: "PRIVATE" };

    const parsed = managerEventSourceSchema.safeParse(input);
    const parsedFrequency = eventsRefreshFrequencySchema.safeParse(frequency);
    if (!parsed.success || !parsedFrequency.success) return { success: false, error: "INVALID" };

    const preset = findPresetByKey(parsed.data.presetKey);
    if (!preset || findPresetForUrl(parsed.data.url)?.key !== preset.key) {
      return { success: false, error: "UNKNOWN_SITE" };
    }

    if (presetAsksVenues(preset) && (parsed.data.venues ?? []).length === 0) {
      return { success: false, error: "VENUES_REQUIRED" };
    }

    if (parsedFrequency.data === "daily" && !(await lairHasPro(validatedId))) {
      return { success: false, error: "PRO_REQUIRED" };
    }

    const source = buildManagerSource(parsed.data, preset);
    const others = (lair.eventsSourceUrls ?? []).filter((candidate) => candidate.managedBy !== "owner");

    await lairsDb.setLairEventSources(validatedId, [...others, source]);
    await lairsDb.setLairEventsRefreshFrequency(validatedId, parsedFrequency.data);

    const result = await refreshEvents(validatedId);
    revalidateLair(validatedId);

    return {
      success: true,
      state: { source, frequency: parsedFrequency.data, report: result.report ?? null },
    };
  } catch (error) {
    console.error("Erreur à la connexion d'une page d'événements :", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Change les villes, les alias de jeu ou le rythme de la source connectée,
 * et relit aussitôt : le gérant voit l'effet de son réglage sans attendre.
 */
export async function updateEventPageSettings(
  lairId: string,
  settings: { venues?: string[]; gameAliases?: Record<string, string>; frequency?: RefreshFrequency },
): Promise<{ success: true; state: ConnectionState } | Failure> {
  try {
    const { lair, validatedId } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };

    const parsed = managerEventSettingsSchema.safeParse(settings);
    if (!parsed.success) return { success: false, error: "INVALID" };

    const current = findManagerSource(lair.eventsSourceUrls);
    if (!current) return { success: false, error: "NOTHING_CONNECTED" };

    const preset = findPresetForUrl(current.url);
    if (!preset) return { success: false, error: "UNKNOWN_SITE" };

    const venues = parsed.data.venues ?? current.htmlConfig?.venues ?? [];
    if (presetAsksVenues(preset) && venues.length === 0) {
      return { success: false, error: "VENUES_REQUIRED" };
    }

    const frequency = parsed.data.frequency ?? lair.eventsRefreshFrequency ?? "weekly";
    if (frequency === "daily" && !(await lairHasPro(validatedId))) {
      return { success: false, error: "PRO_REQUIRED" };
    }

    const source = buildManagerSource(
      {
        url: current.url,
        presetKey: preset.key,
        venues,
        gameAliases: parsed.data.gameAliases ?? current.gameAliases,
      },
      preset,
    );
    const others = (lair.eventsSourceUrls ?? []).filter((candidate) => candidate.managedBy !== "owner");

    await lairsDb.setLairEventSources(validatedId, [...others, source]);
    await lairsDb.setLairEventsRefreshFrequency(validatedId, frequency);

    const result = await refreshEvents(validatedId);
    revalidateLair(validatedId);

    return { success: true, state: { source, frequency, report: result.report ?? null } };
  } catch (error) {
    console.error("Erreur au réglage d'une page d'événements :", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Retire la source du gérant. Ses événements à venir sont retirés ou
 * annulés au tour suivant des autres sources, s'il en reste ; sinon ils
 * demeurent tels quels — rien n'est effacé d'un clic.
 */
export async function disconnectEventPage(lairId: string): Promise<{ success: true } | Failure> {
  try {
    const { lair, validatedId } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };

    if (!findManagerSource(lair.eventsSourceUrls)) return { success: false, error: "NOTHING_CONNECTED" };

    const others = (lair.eventsSourceUrls ?? []).filter((candidate) => candidate.managedBy !== "owner");
    await lairsDb.setLairEventSources(validatedId, others);
    revalidateLair(validatedId);

    return { success: true };
  } catch (error) {
    console.error("Erreur à la déconnexion d'une page d'événements :", error);
    return { success: false, error: "FAILED" };
  }
}

/** Relit toutes les sources du lieu maintenant : le bouton « Vérifier maintenant ». */
export async function refreshLairEventsNow(
  lairId: string,
): Promise<{ success: true; report: LairEventsRefreshReport } | Failure> {
  try {
    const { lair, validatedId } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };
    if ((lair.eventsSourceUrls ?? []).length === 0) return { success: false, error: "NOTHING_CONNECTED" };

    const result = await refreshEvents(validatedId);
    revalidateLair(validatedId);

    if (!result.report) return { success: false, error: "READ_FAILED", message: result.success ? undefined : result.error };
    return { success: true, report: result.report };
  } catch (error) {
    console.error("Erreur au rafraîchissement des événements d'un lieu :", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Demande à l'équipe de connecter une page que Joutes ne sait pas lire.
 *
 * La demande est écrite sur le lieu — c'est elle qui compte, l'administration
 * l'affiche — et l'équipe reçoit un courriel quand l'envoi est configuré.
 * Une nouvelle demande remplace la précédente : un gérant qui se reprend ne
 * fait pas deux tickets.
 */
export async function requestEventSourceHelp(
  lairId: string,
  input: { url?: string; note?: string },
): Promise<{ success: true; requestedAt: string } | Failure> {
  try {
    const { session, lair, validatedId } = await guard(lairId);
    if (!lair) return { success: false, error: "NOT_FOUND" };

    const parsed = eventsSourceHelpRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "INVALID" };

    const requestedAt = DateTime.now().setZone(EVENTS_TIMEZONE).toUTC().toISO() as string;
    const url = parsed.data.url || undefined;
    const note = parsed.data.note || undefined;

    await lairsDb.setLairEventsSourceRequest(validatedId, {
      ...(url ? { url } : {}),
      ...(note ? { note } : {}),
      requestedBy: session.user.id,
      requestedAt,
      status: "pending",
    });

    await notifyTeamOfSourceRequest({
      lairId: validatedId,
      lairName: lair.name,
      url,
      note,
      requesterEmail: session.user.email ?? undefined,
      appUrl: process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim() || "https://joutes.app",
    });

    revalidatePath(`/lairs/${validatedId}/manage`);
    revalidatePath(`/admin/lairs/${validatedId}`);

    return { success: true, requestedAt };
  } catch (error) {
    console.error("Erreur à l'envoi d'une demande de connexion :", error);
    return { success: false, error: "FAILED" };
  }
}
