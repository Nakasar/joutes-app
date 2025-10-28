"use server";

import { requireAdmin } from "@/lib/middleware/admin";
import { Lair } from "@/lib/types/Lair";
import { revalidatePath } from "next/cache";
import { lairSchema, lairIdSchema } from "@/lib/schemas/lair.schema";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { Event } from "@/lib/types/Event";
import { getAllGames } from "@/lib/db/games";

export async function getLairs(): Promise<Lair[]> {
  try {
    await requireAdmin();
    return await lairsDb.getAllLairs();
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

export async function createLair(data: { name: string; banner?: string; games: string[]; eventsSourceUrls: string[] }) {
  try {
    await requireAdmin();
    
    // Valider les données avec Zod
    const validatedData = lairSchema.parse(data);
    
    const newLair = await lairsDb.createLair({
      ...validatedData,
      owners: [],
    });

    revalidatePath("/admin/lairs");
    
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

const eventSchema = z.object({
  events: z.array(z.object({
    name: z.string(),
    startDateTime: z.string().describe("ISO 8601 date format"),
    endDateTime: z.string().describe("ISO 8601 date format"),
    gameName: z.string(),
    price: z.number().optional(),
    status: z.enum(['available', 'sold-out', 'cancelled']),
  }))
});

export async function refreshEvents(lairId: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = lairIdSchema.parse(lairId);
    
    // Récupérer le lair
    const lair = await lairsDb.getLairById(validatedId);
    
    if (!lair) {
      return { success: false, error: "Lieu non trouvé" };
    }
    
    if (!lair.eventsSourceUrls || lair.eventsSourceUrls.length === 0) {
      return { success: false, error: "Aucune URL source configurée pour ce lieu" };
    }

    // Récupérer la liste des jeux existants dans la plateforme
    const existingGames = await getAllGames();
    
    // Récupérer le contenu de toutes les URLs en parallèle
    const pagesContentPromises = lair.eventsSourceUrls.map(async (url) => {
      try {
        const response = await fetch(url);
        const content = await response.text();
        return { url, content };
      } catch (error) {
        console.error(`Erreur lors de la récupération de l'URL ${url}:`, error);
        return null;
      }
    });
    
    const pagesContentResults = await Promise.all(pagesContentPromises);
    const pagesContent = pagesContentResults.filter((page): page is { url: string; content: string } => page !== null);
    
    if (pagesContent.length === 0) {
      return { success: false, error: "Impossible de récupérer le contenu des URLs" };
    }
    
    // Combiner toutes les pages dans un seul prompt
    const combinedPrompt = `
# Instructions

Analyse le contenu HTML suivant provenant de ${pagesContent.length} page(s) différente(s) et extrait tous les événements UNIQUES avec leurs informations.

IMPORTANT: Si un même événement apparaît plusieurs fois (même nom, même date, même lieu), ne le retourne qu'UNE SEULE FOIS.

Pour chaque événement unique, extrait:
- name: Le nom de l'événement
- startDateTime: La date et heure de début au format datetime ISO 8601
- endDateTime: La date et heure de fin au format datetime ISO 8601
- gameName: Le nom du jeu de l'événement (parmi la liste ci-dessous si possible)
- price: Le prix (optionnel, en nombre)
- status: Le statut ('available' si disponible, 'sold-out' si complet, 'cancelled' si annulé)

Pour le champ gameName utilise en priorité les noms des jeux de la liste fournie ci-dessous (le nom du jeu peut varier entre les évènements et lieux de jeu). Si aucun nom ne correspond, utilise le nom trouvé dans la page des évènements.
${existingGames.map(game => `- ${game.name}`).join('\n')}

# Contenu des pages :

${pagesContent.map((page, index) => `
=== PAGE ${index + 1} (${page.url}) ===
${page.content}
`).join('\n').substring(0, 1000000)};`; // Limiter à 100000 caractères pour éviter les prompts trop longs

    try {
      // Utiliser AI SDK pour extraire les événements de toutes les pages en une seule fois
      const { object } = await generateObject({
        model: openai("gpt-4.1-mini"),
        schema: eventSchema,
        prompt: combinedPrompt,
      });
      
      console.log(`${object.events.length} événements uniques extraits pour le lieu ${lair.name}`);
      

      const events: Event[] = object.events.map(event => ({
        ...event,
        id: crypto.randomUUID(),
        lairId: lair.id,
        startDateTime: new Date(event.startDateTime).toISOString(),
        endDateTime: new Date(event.endDateTime).toISOString(),
      }));
      await lairsDb.updateLair(lair.id, { events });
      
      return { 
        success: true, 
        message: `${object.events.length} événements uniques extraits avec succès`,
      };
    } catch (error) {
      console.error("Erreur lors de l'extraction des événements:", error);
      return { success: false, error: "Erreur lors de l'extraction des événements avec l'IA" };
    }
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
