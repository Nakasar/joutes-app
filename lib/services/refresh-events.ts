import { NodeHtmlMarkdown } from 'node-html-markdown'
import { DateTime } from "luxon";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs";
import * as eventsDb from "@/lib/db/events";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { Event } from "@/lib/types/Event";
import { getAllGames } from "@/lib/db/games";

const eventSchema = z.object({
  events: z.array(z.object({
    name: z.string(),
    startDateTime: z.string().describe("ISO 8601 date format"),
    endDateTime: z.string().describe("ISO 8601 date format"),
    gameName: z.string(),
    price: z.number().optional(),
    status: z.enum(['available', 'sold-out', 'cancelled']),
    url: z.string().optional(),
  }))
});

/**
 * Rafraîchit les événements d'un lair en récupérant et analysant le contenu de ses URLs sources
 * @param lairId - L'ID du lair dont on veut rafraîchir les événements
 * @returns Un objet avec success et un message ou une erreur
 */
export async function refreshEvents(lairId: string) {
  try {
    // Récupérer le lair
    const lair = await lairsDb.getLairById(lairId);
    
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
        const contentRaw = await response.text();

        const content = NodeHtmlMarkdown.translate(contentRaw, {}, undefined, undefined);

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

Analyse le contenu HTML suivant provenant de ${pagesContent.length} page(s) différente(s) et extrait tous les événements avec leurs informations.

IMPORTANT: Si un même événement apparaît plusieurs fois (même nom et même date et heure et même lieu), ne le retourne qu'UNE SEULE FOIS.
Un évènement avec le même nom peut apparaître à des dates ou heures différentes, dans ce cas, garde chaque occurence distincte.

Pour chaque événement unique, extrait:
- name: Le nom de l'événement (retire le nom du jeu et la date et l'heure du nom de l'évènement)
- startDateTime: La date et heure de début au format datetime ISO 8601
- endDateTime: La date et heure de fin au format datetime ISO 8601
- gameName: Le nom du jeu de l'événement (parmi la liste ci-dessous si possible)
- price: Le prix (optionnel, en nombre, undefined si non trouvé)
- status: Le statut ('available' si disponible, 'sold-out' si complet, 'cancelled' si annulé)
- url: Le lien vers la page détaillée de l'événement (si disponible, en général dans une balise <a href="..."> ou <https://example.com/some/link>)

Pour le champ gameName utilise en priorité les noms des jeux de la liste fournie ci-dessous (le nom du jeu peut varier entre les évènements et lieux de jeu). Si aucun nom ne correspond, utilise le nom trouvé dans la page des évènements.
${existingGames.map(game => `- ${game.name}`).join('\n')}

Concernant le titre, par exemple:  
- Si le titre est "Soirée Jeu de Rôle - Donjons & Dragons - 15 Mars 2024 20:00", le nom de l'événement est "Soirée Jeu de Rôle".

${lair.eventsSourceInstructions ? `
# Consignes spécifiques pour ce lieu

${lair.eventsSourceInstructions}
` : ''}

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
        startDateTime: DateTime.fromISO(event.startDateTime, { zone: 'Europe/Paris' }).toISO() ?? event.startDateTime,
        endDateTime: DateTime.fromISO(event.endDateTime, { zone: 'Europe/Paris' }).toISO() ?? event.endDateTime,
        addedBy: "AI-SCRAPPING",
      }));
      
      // Replace all events for this lair in the events collection
      await eventsDb.replaceEventsForLair(lair.id, events);
      
      return { 
        success: true, 
        message: `${object.events.length} événements uniques extraits avec succès`,
      };
    } catch (error) {
      console.error("Erreur lors de l'extraction des événements:", error);
      return { success: false, error: "Erreur lors de l'extraction des événements avec l'IA" };
    }
  } catch (error) {
    console.error("Erreur lors du rafraîchissement des événements:", error);
    return { success: false, error: "Erreur lors du rafraîchissement des événements" };
  }
}
