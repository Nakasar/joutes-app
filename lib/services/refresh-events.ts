import { NodeHtmlMarkdown } from "node-html-markdown";
import { DateTime } from "luxon";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import * as lairsDb from "@/lib/db/lairs";
import * as eventsDb from "@/lib/db/events";
import { getAllGames } from "@/lib/db/games";
import { EventSource, EventSourceRefreshResult, Lair, LairEventsRefreshReport } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import {
  canonicalGameName,
  EVENTS_TIMEZONE,
  getNestedValue,
  normalizeEventPrice,
  normalizeEventStatus,
  readEventsCollection,
  resolveEventDates,
  resolveEventUrl,
  type SourceEvent,
} from "@/lib/events/source-events";
import { extractHtmlEvents } from "@/lib/events/html-source";

/**
 * La moisson des événements d'un lieu.
 *
 * Trois sortes de sources : une page lue par un modèle (`IA`), un JSON décrit
 * champ par champ (`MAPPING`), une page lue par sélecteurs CSS (`HTML`, sans
 * modèle — voir `lib/events/html-source.ts`). Chacune est lue **séparément** et rend son
 * propre résultat — succès ou échec, événements, avertissements —, pour trois
 * raisons :
 *
 * - une page en panne ne fait pas échouer la moisson des autres ;
 * - les événements savent de quelle source ils viennent, et le rapprochement
 *   ne retire que ceux d'une source qu'on a vraiment relue ;
 * - l'administration peut **tester une source** avant de l'enregistrer, et
 *   voir ce qu'elle rend.
 *
 * Le rapprochement avec ce qui est déjà en base — et la préservation des
 * favoris et des inscriptions — est l'affaire de `lib/events/source-events.ts`.
 */

/** Le modèle qui lit les pages. */
const EXTRACTION_MODEL = "gpt-4.1-mini";

/** Au-delà, une page est tronquée avant d'être envoyée au modèle. */
const MAX_PAGE_CHARACTERS = 400_000;

const FETCH_TIMEOUT_MS = 25_000;

const USER_AGENT = "JoutesBot/1.0 (+https://joutes.app)";

const extractionSchema = z.object({
  events: z.array(z.object({
    name: z.string(),
    startDateTime: z.string().describe("Date et heure de début, ISO 8601"),
    endDateTime: z.string().nullable().describe("Date et heure de fin, ISO 8601, null si la page ne la donne pas"),
    yearOnPage: z.boolean().describe("true si l'année de l'événement est écrite sur la page, false si tu l'as déduite"),
    gameName: z.string(),
    price: z.number().nullable(),
    status: z.enum(["available", "sold-out", "cancelled"]),
    url: z.string().nullable(),
  })),
});

/** Ce qu'une lecture de source rend, avant toute écriture. */
export type SourceReadResult = {
  source: EventSource;
  ok: boolean;
  error?: string;
  warnings: string[];
  events: SourceEvent[];
};

export type RefreshEventsResult =
  | { success: true; message: string; report: LairEventsRefreshReport }
  | { success: false; error: string; report?: LairEventsRefreshReport };

/**
 * Relit toutes les sources d'un lieu et met ses événements à jour.
 */
export async function refreshEvents(lairId: string): Promise<RefreshEventsResult> {
  const lair = await lairsDb.getLairById(lairId);

  if (!lair) {
    return { success: false, error: "Lieu non trouvé" };
  }

  const sources = lair.eventsSourceUrls ?? [];
  if (sources.length === 0) {
    return { success: false, error: "Aucune URL source configurée pour ce lieu" };
  }

  const games = await getAllGames();
  const now = DateTime.now().setZone(EVENTS_TIMEZONE);

  const reads = await Promise.all(sources.map((source) => readEventSource(source, lair, games, now)));

  const failed = reads.filter((read) => !read.ok);
  const events = reads.flatMap((read) => read.events);

  const toResult = (read: SourceReadResult): EventSourceRefreshResult => ({
    url: read.source.url,
    ok: read.ok,
    ...(read.error ? { error: read.error } : {}),
    warnings: read.warnings,
    count: read.events.length,
  });

  if (failed.length === sources.length) {
    const report: LairEventsRefreshReport = {
      at: now.toUTC().toISO() as string,
      sources: reads.map(toResult),
      inserted: 0, updated: 0, unchanged: 0, cancelled: 0, removed: 0,
    };
    await lairsDb.setLairEventsRefreshReport(lair.id, report);

    return { success: false, error: "Aucune source n'a pu être lue", report };
  }

  try {
    const counts = await eventsDb.upsertEventsForLair(lair.id, events, {
      failedSourceUrls: failed.map((read) => read.source.url),
      now,
    });

    const report: LairEventsRefreshReport = {
      at: now.toUTC().toISO() as string,
      sources: reads.map(toResult),
      ...counts,
    };
    await lairsDb.setLairEventsRefreshReport(lair.id, report);

    return { success: true, message: describeReport(report), report };
  } catch (error) {
    console.error(`Erreur lors du rafraîchissement des événements du lieu ${lair.id}:`, error);
    return { success: false, error: "Erreur lors de l'enregistrement des événements" };
  }
}

/**
 * Lit une source sans rien écrire : ce que le bouton « Tester » de
 * l'administration appelle, sur une source pas encore enregistrée.
 */
export async function previewEventSource(lair: Lair, source: EventSource): Promise<SourceReadResult> {
  const games = await getAllGames();
  return readEventSource(source, lair, games, DateTime.now().setZone(EVENTS_TIMEZONE));
}

/** Le résumé d'un rafraîchissement, en une phrase. */
export function describeReport(report: LairEventsRefreshReport): string {
  const failures = report.sources.filter((source) => !source.ok);
  const parts = [
    `${report.inserted} nouveaux`,
    `${report.updated} mis à jour`,
    `${report.unchanged} inchangés`,
    `${report.cancelled} annulés`,
    `${report.removed} retirés`,
  ];

  const summary = `${parts.join(", ")}.`;
  if (failures.length === 0) return summary;

  return `${summary} ${failures.length} source${failures.length > 1 ? "s" : ""} en échec, laissée${failures.length > 1 ? "s" : ""} en l'état.`;
}

// ---------------------------------------------------------------------------
// Lecture d'une source
// ---------------------------------------------------------------------------

async function readEventSource(
  source: EventSource,
  lair: Lair,
  games: Pick<Game, "name">[],
  now: DateTime,
): Promise<SourceReadResult> {
  try {
    if (source.type === "MAPPING") {
      return await readMappingSource(source, games, now);
    }
    if (source.type === "HTML") {
      return await readHtmlSource(source, games, now);
    }
    return await readAISource(source, lair, games, now);
  } catch (error) {
    console.error(`Erreur lors de la lecture de la source ${source.url}:`, error);
    return { source, ok: false, error: describeError(error), warnings: [], events: [] };
  }
}

/**
 * Télécharge une source.
 *
 * Un délai, un agent identifiable, et un refus des réponses en erreur : sans
 * cela, une page en 503 rendait une page d'erreur que le modèle lisait comme
 * une page sans événement — et tout ce que la source annonçait était retiré.
 */
async function fetchSource(source: Pick<EventSource, "url" | "formFields">, accept: string): Promise<Response> {
  const parsed = new URL(source.url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Seules les adresses http(s) sont lues");
  }

  // Des champs de formulaire : la page se demande en POST, comme le ferait
  // le navigateur en validant le formulaire — c'est ainsi qu'un site qui
  // sert plusieurs villes sur la même adresse rend celle qu'on veut.
  const formFields = source.formFields && Object.keys(source.formFields).length > 0 ? source.formFields : null;

  const response = await fetch(source.url, {
    method: formFields ? "POST" : "GET",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      ...(formFields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(formFields ? { body: new URLSearchParams(formFields).toString() } : {}),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response;
}

/**
 * Le texte d'une réponse, dans son encodage à elle.
 *
 * `response.text()` décode toujours en UTF-8. Or bien des sites de boutique
 * servent encore de l'ISO-8859-1 : les accents arrivaient cassés — « D�fis de
 * ligue » —, s'écrivaient tels quels en base, et faisaient échouer le
 * rapprochement par nom au tour suivant. On lit donc le jeu de caractères de
 * l'en-tête, à défaut de la balise `<meta>`, et on décode avec.
 */
async function readResponseText(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());

  const fromHeader = /charset=["']?([^;"'\s]+)/i.exec(response.headers.get("content-type") ?? "")?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta =
    /<meta[^>]+charset=["']?([^;"'\s>]+)/i.exec(head)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=([^;"'\s]+)/i.exec(head)?.[1];

  const charset = (fromHeader ?? fromMeta ?? "utf-8").trim().toLowerCase();

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `Pas de réponse en ${FETCH_TIMEOUT_MS / 1000} s`;
    }
    return error.message || error.name;
  }
  return String(error);
}

/** Regroupe les avertissements identiques : « 3 × date de début illisible ». */
class Warnings {
  private readonly counts = new Map<string, number>();

  add(message: string) {
    this.counts.set(message, (this.counts.get(message) ?? 0) + 1);
  }

  list(): string[] {
    return [...this.counts.entries()].map(([message, count]) => (count > 1 ? `${count} × ${message}` : message));
  }
}

// ---------------------------------------------------------------------------
// Source IA
// ---------------------------------------------------------------------------

async function readAISource(
  source: EventSource,
  lair: Lair,
  games: Pick<Game, "name">[],
  now: DateTime,
): Promise<SourceReadResult> {
  const response = await fetchSource(source, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
  const html = await readResponseText(response);
  const content = NodeHtmlMarkdown.translate(html).trim();

  if (!content) {
    return { source, ok: false, error: "La page est vide une fois lue", warnings: [], events: [] };
  }

  const { object } = await generateObject({
    model: openai(EXTRACTION_MODEL),
    schema: extractionSchema,
    prompt: buildExtractionPrompt({ source, lair, games, now, content: content.slice(0, MAX_PAGE_CHARACTERS) }),
  });

  const warnings = new Warnings();
  const events: SourceEvent[] = [];

  for (const extracted of object.events) {
    const dates = resolveEventDates({
      start: extracted.startDateTime,
      end: extracted.endDateTime,
      now,
      trustYear: extracted.yearOnPage,
    });

    if (!dates) {
      warnings.add(`date de début illisible, événement ignoré (« ${extracted.name} »)`);
      continue;
    }

    const name = extracted.name.trim();
    if (!name) {
      warnings.add("événement sans nom, ignoré");
      continue;
    }

    // Jamais une chaîne vide : la jointure des agendas est exacte, et un
    // événement sans nom de jeu n'apparaîtrait nulle part.
    const rawGame = extracted.gameName.trim();
    const gameName = rawGame ? canonicalGameName(rawGame, games, source.gameAliases) ?? rawGame : "Jeu non spécifié";
    if (!rawGame) {
      warnings.add(`jeu absent pour « ${name} », « Jeu non spécifié » écrit à la place`);
    } else if (!canonicalGameName(rawGame, games, source.gameAliases)) {
      warnings.add(`jeu inconnu de la plateforme : « ${rawGame} »`);
    }

    events.push({
      name,
      ...dates,
      gameName,
      price: extracted.price ?? undefined,
      status: extracted.status,
      url: resolveEventUrl(extracted.url, source.url),
      addedBy: "AI-SCRAPPING",
      sourceUrl: source.url,
    });
  }

  return { source, ok: true, warnings: warnings.list(), events };
}

function buildExtractionPrompt({
  source,
  lair,
  games,
  now,
  content,
}: {
  source: EventSource;
  lair: Lair;
  games: Pick<Game, "name">[];
  now: DateTime;
  content: string;
}): string {
  return `# Instructions

Nous sommes le ${now.setLocale("fr").toFormat("cccc d LLLL yyyy")} (fuseau ${EVENTS_TIMEZONE}). Analyse le contenu suivant, tiré de la page ${source.url} du lieu « ${lair.name} », et extrait tous les événements qu'elle annonce.

IMPORTANT :
- Si un même événement apparaît plusieurs fois (même nom, même date, même heure), ne le retourne qu'UNE SEULE FOIS.
- Un événement du même nom à des dates ou heures différentes est un événement distinct : garde chaque occurrence.
- Une URL ne désigne qu'UN SEUL événement : si plusieurs événements partagent la même URL, c'est le même événement.
- Les dates sont en heure de Paris. Quand la page ne donne pas l'année, déduis-la de la date du jour : une page d'agenda annonce ce qui vient, et met yearOnPage à false.

Pour chaque événement :
- name : le nom de l'événement, sans le nom du jeu ni la date ni l'heure. « Soirée Jeu de Rôle - Donjons & Dragons - 15 mars 2024 20:00 » donne « Soirée Jeu de Rôle ».
- startDateTime : la date et l'heure de début, ISO 8601.
- endDateTime : la date et l'heure de fin, ISO 8601, ou null si la page ne la donne pas.
- yearOnPage : true si l'année est écrite sur la page pour cet événement, false si tu l'as déduite.
- gameName : le nom du jeu, en priorité parmi ceux de la liste ci-dessous (le nom peut varier d'une page à l'autre). Sinon, celui que la page donne.
- price : le prix en nombre, ou null.
- status : 'available' si ouvert, 'sold-out' si complet, 'cancelled' si annulé.
- url : le lien vers la page de l'événement, complet (avec le nom d'hôte). Sur https://my-site.com/events, un lien « /details/123 » devient https://my-site.com/details/123. null s'il n'y en a pas.

Jeux connus de la plateforme :
${games.map((game) => `- ${game.name}`).join("\n")}
${source.instructions ? `
# Consignes spécifiques pour cette page

${source.instructions}
` : ""}${lair.eventsSourceInstructions ? `
# Consignes spécifiques pour ce lieu

${lair.eventsSourceInstructions}
` : ""}
# Contenu de la page

${content}`;
}

// ---------------------------------------------------------------------------
// Source en correspondance (JSON)
// ---------------------------------------------------------------------------

async function readMappingSource(
  source: EventSource,
  games: Pick<Game, "name">[],
  now: DateTime,
): Promise<SourceReadResult> {
  const config = source.mappingConfig;
  if (!config) {
    return { source, ok: false, error: "Source en correspondance sans configuration", warnings: [], events: [] };
  }

  const response = await fetchSource(source, "application/json,text/json;q=0.9,*/*;q=0.8");
  const text = await readResponseText(response);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { source, ok: false, error: "La réponse n'est pas un JSON valide", warnings: [], events: [] };
  }

  const items = readEventsCollection(data, config.eventsPath);
  if (!items) {
    return {
      source,
      ok: false,
      error: `Le chemin « ${config.eventsPath} » ne désigne pas une liste d'événements`,
      warnings: [],
      events: [],
    };
  }

  const mapping = config.eventsFieldsMapping;
  const overrides = config.eventsFieldsValues ?? {};
  const read = (item: unknown, path?: string) => (path ? getNestedValue(item, path) : undefined);
  const warnings = new Warnings();
  const events: SourceEvent[] = [];

  for (const item of items) {
    const dates = resolveEventDates({
      start: overrides.startDateTime || read(item, mapping.startDateTime),
      end: overrides.endDateTime || read(item, mapping.endDateTime),
      now,
      trustYear: true,
    });

    if (!dates) {
      warnings.add(`date de début illisible au chemin « ${mapping.startDateTime || "(non renseigné)"} », événement ignoré`);
      continue;
    }

    const rawName = overrides.name || read(item, mapping.name);
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) {
      warnings.add(`nom absent au chemin « ${mapping.name || "(non renseigné)"} », « Événement sans nom » écrit à la place`);
    }

    const rawGame = overrides.gameName || read(item, mapping.gameName);
    const gameName = typeof rawGame === "string" && rawGame.trim() ? canonicalGameName(rawGame, games, source.gameAliases) ?? rawGame.trim() : null;
    if (!gameName) {
      warnings.add(`jeu absent au chemin « ${mapping.gameName || "(non renseigné)"} », « Jeu non spécifié » écrit à la place`);
    } else if (!canonicalGameName(gameName, games, source.gameAliases)) {
      warnings.add(`jeu inconnu de la plateforme : « ${gameName} »`);
    }

    const rawStatus = overrides.status || read(item, mapping.status);
    let status = normalizeEventStatus(rawStatus);
    if (!status) {
      if (rawStatus !== undefined && rawStatus !== null && rawStatus !== "") {
        warnings.add(`statut « ${String(rawStatus)} » inconnu, lu comme « available »`);
      }
      status = "available";
    }

    const rawId = read(item, mapping.id);
    const externalId = rawId !== undefined && rawId !== null && rawId !== "" ? String(rawId) : undefined;

    let url = overrides.url ? resolveEventUrl(overrides.url, source.url) : resolveEventUrl(read(item, mapping.url), source.url);
    if (!url && config.eventsBaseUrl && externalId) {
      url = resolveEventUrl(config.eventsBaseUrl + externalId, source.url);
    }

    events.push({
      name: name || "Événement sans nom",
      ...dates,
      gameName: gameName ?? "Jeu non spécifié",
      price: overrides.price !== undefined ? overrides.price : normalizeEventPrice(read(item, mapping.price)),
      status,
      url,
      addedBy: "JSON-MAPPING",
      sourceUrl: source.url,
      externalId,
    });
  }

  return { source, ok: true, warnings: warnings.list(), events };
}

// ---------------------------------------------------------------------------
// Source HTML (sélecteurs)
// ---------------------------------------------------------------------------

async function readHtmlSource(
  source: EventSource,
  games: Pick<Game, "name">[],
  now: DateTime,
): Promise<SourceReadResult> {
  const config = source.htmlConfig;
  if (!config) {
    return { source, ok: false, error: "Source HTML sans configuration", warnings: [], events: [] };
  }

  const response = await fetchSource(source, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
  const html = await readResponseText(response);

  const extraction = extractHtmlEvents({ html, config, source, games, now });

  // Un sélecteur qui ne désigne rien est bien plus souvent une mise en page
  // qui a changé qu'un agenda vide : une panne, qui ne retire rien.
  if (extraction.itemCount === 0) {
    return {
      source,
      ok: false,
      error: `Le sélecteur « ${config.itemSelector} » ne désigne aucun élément de la page`,
      warnings: [],
      events: [],
    };
  }

  return { source, ok: true, warnings: extraction.warnings, events: extraction.events };
}
