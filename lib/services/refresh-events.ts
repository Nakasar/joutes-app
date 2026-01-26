import { NodeHtmlMarkdown } from 'node-html-markdown'
import { DateTime } from "luxon";
import { z } from "zod";
import * as lairsDb from "@/lib/db/lairs";
import * as eventsDb from "@/lib/db/events";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { Event } from "@/lib/types/Event";
import { getAllGames } from "@/lib/db/games";
import { EventSource } from "@/lib/types/Lair";

const eventSchema = z.object({
  events: z.array(z.object({
    name: z.string(),
    startDateTime: z.string().describe("ISO 8601 date format"),
    endDateTime: z.string().describe("ISO 8601 date format"),
    gameName: z.string(),
    price: z.number().optional().nullable(),
    status: z.enum(['available', 'sold-out', 'cancelled']),
    url: z.string().optional().nullable(),
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

    // Séparer les sources par type
    const aiSources = lair.eventsSourceUrls.filter(source => source.type === 'IA');
    const mappingSources = lair.eventsSourceUrls.filter(source => source.type === 'MAPPING');

    let allEvents: Event[] = [];

    // Traiter les sources IA (logique existante)
    if (aiSources.length > 0) {
      const aiEvents = await processAISources(aiSources, lair, existingGames);
      allEvents = allEvents.concat(aiEvents);
    }

    // Traiter les sources MAPPING
    if (mappingSources.length > 0) {
      const mappingEvents = await processMappingSources(mappingSources, lair);
      allEvents = allEvents.concat(mappingEvents);
    }

    if (allEvents.length === 0) {
      return { success: false, error: "Aucun événement extrait" };
    }

    // Upsert events for this lair (update existing ones based on URL + lairId, insert new ones)
    const { inserted, updated } = await eventsDb.upsertEventsForLair(lair.id, allEvents);
    
    return { 
      success: true, 
      message: `${inserted} nouveaux événements créés, ${updated} événements mis à jour`,
    };
  } catch (error) {
    console.error("Erreur lors du rafraîchissement des événements:", error);
    return { success: false, error: "Erreur lors du rafraîchissement des événements" };
  }
}

/**
 * Traite les sources de type IA en utilisant l'extraction intelligente
 */
async function processAISources(sources: EventSource[], lair: any, existingGames: any[]) {
  // Récupérer le contenu de toutes les URLs en parallèle
  const pagesContentPromises: Promise<{ url: string, content: string, instructions?: string } | null>[] = sources.map(async (source) => {
    try {
      const response = await fetch(source.url);
      const contentRaw = await response.text();

      const content = NodeHtmlMarkdown.translate(contentRaw, {}, undefined, undefined);

      return { url: source.url, content, instructions: source.instructions };
    } catch (error) {
      console.error(`Erreur lors de la récupération de l'URL ${source.url}:`, error);
      return null;
    }
  });
  
  const pagesContentResults = await Promise.all(pagesContentPromises);
  const pagesContent = pagesContentResults.filter((page): page is { url: string; content: string; instructions?: string } => page !== null);
  
  if (pagesContent.length === 0) {
    console.warn("Aucun contenu récupéré pour les sources IA");
    return [];
  }
  
  // Combiner toutes les pages dans un seul prompt
  const combinedPrompt = `
# Instructions

Analyse le contenu HTML suivant provenant de ${pagesContent.length} page(s) différente(s) et extrait tous les événements avec leurs informations.

IMPORTANT: Si un même événement apparaît plusieurs fois (même nom et même date et heure et même lieu), ne le retourne qu'UNE SEULE FOIS.
Un évènement avec le même nom peut apparaître à des dates ou heures différentes, dans ce cas, garde chaque occurence distincte.
Un URL ne peut être associée qu'à UN SEUL événement. Si plusieurs événements partagent le même URL, considère que c'est le même événement et ne le retourne qu'une seule fois dans ton JSON.

Pour chaque événement unique, extrait:
- name: Le nom de l'événement (retire le nom du jeu et la date et l'heure du nom de l'évènement)
- startDateTime: La date et heure de début au format datetime ISO 8601
- endDateTime: La date et heure de fin au format datetime ISO 8601
- gameName: Le nom du jeu de l'événement (parmi la liste ci-dessous si possible)
- price: Le prix (optionnel, en nombre, undefined si non trouvé, ne pas utiliser null)
- status: Le statut ('available' si disponible, 'sold-out' si complet, 'cancelled' si annulé)
- url: Le lien vers la page détaillée de l'événement (si disponible, en général dans une balise <a href="..."> ou <https://example.com/some/link>). Doit contenir le hostname (depuis la racine de la page extraite si non fourni).

Pour le champ gameName utilise en priorité les noms des jeux de la liste fournie ci-dessous (le nom du jeu peut varier entre les évènements et lieux de jeu). Si aucun nom ne correspond, utilise le nom trouvé dans la page des évènements.
${existingGames.map(game => `- ${game.name}`).join('\n')}

Concernant le titre, par exemple:  
- Si le titre est "Soirée Jeu de Rôle - Donjons & Dragons - 15 Mars 2024 20:00", le nom de l'événement est "Soirée Jeu de Rôle".

Concernant l'url, par exemple:
- Si sur la page https://my-site.com/events un événement a un lien relatif "/details/123", l'url complète est "https://my-site.com/details/123".

${lair.eventsSourceInstructions ? `
# Consignes spécifiques globales pour ce lieu

${lair.eventsSourceInstructions}
` : ''}

# Contenu des pages :

${pagesContent.map((page, index) => `
=== PAGE ${index + 1} (${page.url}) ===
${page.instructions ? `Instructions spécifiques pour cette page: ${page.instructions}\n` : ''}
${page.content}
`).join('\n').substring(0, 1000000)};`; // Limiter à 100000 caractères pour éviter les prompts trop longs

  try {
    // Utiliser AI SDK pour extraire les événements de toutes les pages en une seule fois
    const { object } = await generateObject({
      model: openai("gpt-4.1-mini"),
      schema: eventSchema,
      prompt: combinedPrompt,
    });
    
    console.log(`${object.events.length} événements uniques extraits via IA pour le lieu ${lair.name}`);

    // Set start and end date year to current year, unless the event month is december and current month is january (then set to last year)
    const currentYear = DateTime.now().year;
    const currentMonth = DateTime.now().month;
    
    const events: Event[] = object.events.map(event => {
      const startDate = DateTime.fromISO(event.startDateTime, { zone: 'Europe/Paris' });
      const endDate = DateTime.fromISO(event.endDateTime, { zone: 'Europe/Paris' });

      let adjustedYear = currentYear;
      if (startDate.month === 12 && currentMonth === 1) {
        adjustedYear = currentYear - 1;
      }

      const startDateTime = startDate.set({ year: adjustedYear }).toISO() ?? event.startDateTime;
      const endDateTime = endDate.set({ year: adjustedYear }).toISO() ?? event.endDateTime;

      return {
        ...event,
        price: event.price ?? undefined,
        url: event.url ?? undefined,
        id: crypto.randomUUID(),
        lairId: lair.id,
        startDateTime: DateTime.fromISO(startDateTime, { zone: 'Europe/Paris' }).toISO() ?? event.startDateTime,
        endDateTime: DateTime.fromISO(endDateTime, { zone: 'Europe/Paris' }).toISO() ?? event.endDateTime,
        addedBy: "AI-SCRAPPING",
      };
    });

    return events;
  } catch (error) {
    console.error("Erreur lors de l'extraction des événements via IA:", error);
    return [];
  }
}

/**
 * Traite les sources de type MAPPING en récupérant le JSON et appliquant le mapping configuré
 */
async function processMappingSources(sources: EventSource[], lair: any) {
  const allEvents: Event[] = [];

  for (const source of sources) {
    if (!source.mappingConfig) {
      console.warn(`Source MAPPING sans configuration: ${source.url}`);
      continue;
    }

    try {
      // Fetch JSON data
      const response = await fetch(source.url);
      const jsonData = await response.json();

      // Navigate to events using eventsPath
      const events = getNestedValue(jsonData, source.mappingConfig.eventsPath);

      if (!Array.isArray(events)) {
        console.warn(`Le chemin ${source.mappingConfig.eventsPath} ne pointe pas vers un tableau`);
        continue;
      }

      console.log(`${events.length} événements trouvés dans ${source.url}`);

      // Map each event
      const mappedEvents = events.map((eventData: any) => {
        const mapping = source.mappingConfig!.eventsFieldsMapping;
        const overrides = source.mappingConfig!.eventsFieldsValues || {};

        // Extract values from JSON using mapping
        const name = overrides.name || getNestedValue(eventData, mapping.name || '');
        const startDateTime = overrides.startDateTime || getNestedValue(eventData, mapping.startDateTime || '');
        const endDateTime = overrides.endDateTime || getNestedValue(eventData, mapping.endDateTime || '');
        const gameName = overrides.gameName || getNestedValue(eventData, mapping.gameName || '');
        const price = overrides.price !== undefined ? overrides.price : (mapping.price ? parseFloat(getNestedValue(eventData, mapping.price)) : undefined);
        const status = overrides.status || getNestedValue(eventData, mapping.status || '') || 'available';
        let url = overrides.url || getNestedValue(eventData, mapping.url || '');
        if (!url && source.mappingConfig!.eventsBaseUrl) {
          url = source.mappingConfig!.eventsBaseUrl + (getNestedValue(eventData, mapping.id || '') || '');
        }

        // Set start and end date year to current year, unless the event month is december and current month is january
        const currentYear = DateTime.now().year;
        const currentMonth = DateTime.now().month;
        
        const startDate = DateTime.fromISO(startDateTime, { zone: 'Europe/Paris' });
        const endDate = DateTime.fromISO(endDateTime, { zone: 'Europe/Paris' });

        let adjustedYear = currentYear;
        if (startDate.month === 12 && currentMonth === 1) {
          adjustedYear = currentYear - 1;
        }

        const adjustedStartDateTime = startDate.set({ year: adjustedYear }).toISO() ?? startDateTime;
        let adjustedEndDateTime = endDate.set({ year: adjustedYear }).toISO() ?? endDateTime;
        if (!adjustedEndDateTime) {
          // If endDateTime is invalid, set it to startDateTime + 4 hours
          adjustedEndDateTime = DateTime.fromISO(adjustedStartDateTime, { zone: 'Europe/Paris' }).plus({ hours: 4 }).toISO() ?? adjustedStartDateTime;
        }

        return {
          id: crypto.randomUUID(),
          lairId: lair.id,
          name: name || 'Événement sans nom',
          startDateTime: DateTime.fromISO(adjustedStartDateTime, { zone: 'Europe/Paris' }).toISO() ?? adjustedStartDateTime,
          endDateTime: DateTime.fromISO(adjustedEndDateTime, { zone: 'Europe/Paris' }).toISO() ?? adjustedEndDateTime,
          gameName: gameName || 'Jeu non spécifié',
          price: isNaN(price as number) ? undefined : price,
          status: status as 'available' | 'sold-out' | 'cancelled',
          url: url || undefined,
          addedBy: "JSON-MAPPING",
        };
      });

      allEvents.push(...mappedEvents);
    } catch (error) {
      console.error(`Erreur lors du traitement de la source ${source.url}:`, error);
    }
  }

  return allEvents;
}

/**
 * Récupère une valeur dans un objet en utilisant un chemin (ex: "data.events" ou "results[0].name")
 */
function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined;
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    
    // Handle array indexing like "results[0]"
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayKey, index] = arrayMatch;
      return current[arrayKey]?.[parseInt(index)];
    }
    
    return current[key];
  }, obj);
}
