"use server";

import { requireAdmin } from "@/lib/middleware/admin.ts";
import { Lair, EventSource } from "@/lib/types/Lair.ts";
import { revalidatePath } from "next/cache";
import {
  lairSchema,
  lairIdSchema,
  lairDetailsSchema,
  lairGamesSchema,
  lairEventSourcesSchema,
  eventSourceSchema,
} from "@/lib/schemas/lair.schema.ts";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs.ts";
import {
  previewEventSource,
  refreshEvents as refreshEventsService,
  RefreshEventsResult,
} from "@/lib/services/refresh-events.ts";
import type { SourceEvent } from "@/lib/events/source-events.ts";

/** Ce que le bouton « Tester » d'une source rend au formulaire. */
export type EventSourcePreview = {
  ok: boolean;
  error?: string;
  warnings: string[];
  events: Omit<SourceEvent, "addedBy" | "sourceUrl">[];
};

export async function getLairs(): Promise<Lair[]> {
  try {
    await requireAdmin();
    return await lairsDb.getAllLairs();
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

export async function createLair(data: { 
  name: string; 
  banner?: string; 
  games: string[]; 
  eventsSourceUrls: EventSource[];
  eventsSourceInstructions?: string;
  location?: { type: "Point"; coordinates: [number, number] };
  address?: string;
  website?: string;
}) {
  try {
    await requireAdmin();
    
    // Valider les données avec Zod
    const validatedData = lairSchema.parse(data);
    
    const newLair = await lairsDb.createLair({
      ...validatedData,
      owners: [],
    });

    revalidatePath("/admin/lairs");
    revalidatePath("/lairs");
    
    return { success: true, lair: newLair };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la création du lieu:", error);
    return { success: false, error: "Erreur lors de la création du lieu" };
  }
}

export async function updateLair(id: string, data: { 
  name: string; 
  banner?: string; 
  games: string[]; 
  eventsSourceUrls: EventSource[];
  eventsSourceInstructions?: string;
  location?: { type: "Point"; coordinates: [number, number] };
  address?: string;
  website?: string;
}) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = lairIdSchema.parse(id);
    
    // Valider les données avec Zod
    const validatedData = lairSchema.parse(data);
    
    const updatedLair = await lairsDb.updateLair(validatedId, validatedData);

    if (!updatedLair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    revalidatePath("/admin/lairs");
    revalidatePath("/lairs");
    revalidatePath(`/lairs/${validatedId}`);
    
    return { success: true, lair: updatedLair };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la mise à jour du lieu:", error);
    return { success: false, error: "Erreur lors de la mise à jour du lieu" };
  }
}

/** Les chemins que touche une écriture sur un lieu. */
function revalidateLair(id: string) {
  revalidatePath("/admin/lairs");
  revalidatePath(`/admin/lairs/${id}`);
  revalidatePath("/lairs");
  revalidatePath(`/lairs/${id}`);
}

/**
 * Identité d'un lieu : nom, bannière, adresse, point sur la carte, site.
 *
 * `lairDetailsSchema` plutôt que `lairSchema`, et c'est ce qui compte ici : le
 * second ramènerait ses valeurs par défaut dans la charge écrite — `isPrivate`
 * à `false`, un lieu privé redevenu public en enregistrant son nom, et
 * `eventsSourceUrls` à `[]`, ses sources effacées. Ce que l'onglet n'envoie pas
 * ne doit pas être réécrit.
 */
export async function updateLairIdentity(
  id: string,
  data: {
    name: string;
    banner?: string;
    location?: { type: "Point"; coordinates: [number, number] };
    address?: string;
    website?: string;
  }
) {
  try {
    await requireAdmin();

    const validatedId = lairIdSchema.parse(id);
    const validated = lairDetailsSchema.omit({ games: true }).parse(data);

    const updated = await lairsDb.updateLair(validatedId, validated);

    if (!updated) {
      return { success: false, error: "Lieu non trouvé" };
    }

    revalidateLair(validatedId);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la mise à jour du lieu:", error);
    return { success: false, error: "Erreur lors de la mise à jour du lieu" };
  }
}

/** Les jeux déclarés par un lieu. */
export async function updateLairGames(id: string, games: string[]) {
  try {
    await requireAdmin();

    const validatedId = lairIdSchema.parse(id);
    const validated = lairGamesSchema.parse({ games });

    const updated = await lairsDb.updateLair(validatedId, validated);

    if (!updated) {
      return { success: false, error: "Lieu non trouvé" };
    }

    revalidateLair(validatedId);
    // La fiche d'un jeu liste ses lieux : elle change avec cette déclaration.
    revalidatePath("/games");

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la mise à jour des jeux du lieu:", error);
    return { success: false, error: "Erreur lors de la mise à jour des jeux du lieu" };
  }
}

/**
 * Sources d'événements d'un lieu.
 *
 * L'interdiction faite aux lieux privés est vérifiée ici plutôt que dans le
 * schéma : celui-ci ne reçoit pas `isPrivate`, et le lire depuis la charge du
 * client reviendrait à laisser celui-ci décider s'il a le droit d'écrire.
 */
export async function updateLairEventSources(id: string, eventsSourceUrls: unknown) {
  try {
    await requireAdmin();

    const validatedId = lairIdSchema.parse(id);
    const validated = lairEventSourcesSchema.parse({ eventsSourceUrls });

    const lair = await lairsDb.getLairById(validatedId);

    if (!lair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    if (lair.isPrivate && validated.eventsSourceUrls.length > 0) {
      return {
        success: false,
        error: "Les lieux privés ne peuvent pas avoir d'URL de scraping d'événements",
      };
    }

    const updated = await lairsDb.updateLair(validatedId, validated);

    if (!updated) {
      return { success: false, error: "Lieu non trouvé" };
    }

    revalidateLair(validatedId);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la mise à jour des sources d'événements:", error);
    return { success: false, error: "Erreur lors de la mise à jour des sources d'événements" };
  }
}

export async function deleteLair(id: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = lairIdSchema.parse(id);
    
    const deleted = await lairsDb.deleteLair(validatedId);
    
    if (!deleted) {
      return { success: false, error: "Lieu non trouvé" };
    }
    
    revalidatePath("/admin/lairs");
    revalidatePath("/lairs");
    
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "ID invalide" 
      };
    }
    console.error("Erreur lors de la suppression du lieu:", error);
    return { success: false, error: "Erreur lors de la suppression du lieu" };
  }
}

export async function refreshEvents(lairId: string): Promise<RefreshEventsResult> {
  try {
    await requireAdmin();

    // Valider l'ID
    const validatedId = lairIdSchema.parse(lairId);

    // Appeler le service de rafraîchissement des événements
    const result = await refreshEventsService(validatedId);

    // Les agendas du lieu changent avec ses événements.
    revalidateLair(validatedId);
    revalidatePath("/events");

    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "ID invalide" 
      };
    }
    console.error("Erreur lors du rafraîchissement des événements:", error);
    return { success: false, error: "Erreur lors du rafraîchissement des événements" };
  }
}

/**
 * Lit une source telle qu'elle est saisie, sans rien écrire.
 *
 * La source vient du formulaire, pas de la base : c'est précisément pour
 * vérifier une correspondance **avant** de l'enregistrer — et avant que le
 * cron ne la découvre fausse — que ce bouton existe. Elle passe par le même
 * schéma que l'enregistrement, pour que ce qui marche au test marche ensuite.
 */
export async function previewLairEventSource(
  lairId: string,
  source: unknown,
): Promise<{ success: true; preview: EventSourcePreview } | { success: false; error: string }> {
  try {
    await requireAdmin();

    const validatedId = lairIdSchema.parse(lairId);
    const validatedSource = eventSourceSchema.parse(source);

    const lair = await lairsDb.getLairById(validatedId);
    if (!lair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    const read = await previewEventSource(lair, validatedSource);

    return {
      success: true,
      preview: {
        ok: read.ok,
        ...(read.error ? { error: read.error } : {}),
        warnings: read.warnings,
        events: read.events.map((event) => ({
          name: event.name,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          gameName: event.gameName,
          ...(event.price !== undefined ? { price: event.price } : {}),
          status: event.status,
          ...(event.url !== undefined ? { url: event.url } : {}),
          ...(event.externalId !== undefined ? { externalId: event.externalId } : {}),
        })),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Source invalide" };
    }
    console.error("Erreur lors du test d'une source d'événements:", error);
    return { success: false, error: "Erreur lors du test de la source" };
  }
}

export async function updateCalendarMode(lairId: string, mode: 'CALENDAR' | 'AGENDA' | 'CONFERENCE') {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = lairIdSchema.parse(lairId);

    // Écriture ciblée : le reste de `options` — thème, sections, annonces,
    // horaires — n'a pas à disparaître parce qu'on change la vue du calendrier.
    const updated = await lairsDb.setLairCalendarMode(validatedId, mode);

    if (!updated) {
      return { success: false, error: "Lieu non trouvé" };
    }

    revalidateLair(validatedId);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "ID invalide" 
      };
    }
    console.error("Erreur lors de la mise à jour du mode du calendrier:", error);
    return { success: false, error: "Erreur lors de la mise à jour du mode du calendrier" };
  }
}
