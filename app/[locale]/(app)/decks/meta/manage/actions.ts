"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/db/permissions";
import { GAMES_CACHE_TAG } from "@/lib/db/games-cached";
import { getGameBySlugOrId, setGameMetaSettings } from "@/lib/db/games";
import {
  importMetaDecks,
  markDeckAsMeta,
  removeMetaBatch,
  removeMetaDeck,
  toPublicRows,
  type PublicMetaImportRow,
} from "@/lib/db/meta-decks";
import { MetaImportTooLargeError, resolveMetaImport } from "@/lib/meta/import";
import { metaCacheTag } from "@/lib/meta/cache";
import { META_DECKS_PERMISSION } from "@/lib/meta/permissions";
import { DEFAULT_META_SETTINGS, resolveMetaSettings, type GameMetaSettings, type ResolvedMetaSettings } from "@/lib/meta/settings";

type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** La session, si elle porte la permission de gérer la méta ; sinon rien. */
async function requireMetaManager() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !(await hasPermission(META_DECKS_PERMISSION))) {
    return null;
  }
  return session;
}

/** Toute écriture change l'échantillon : la page Méta du jeu et la librairie se relisent. */
function refreshMeta(gameId: string) {
  updateTag(metaCacheTag(gameId));
  revalidatePath("/decks/library");
  revalidatePath("/decks/meta/manage");
}

const importSchema = z.object({
  gameId: z.string().min(1),
  input: z.string().min(1, "Collez au moins un lien, un code ou une liste.").max(200_000),
  source: z.string().trim().min(1, "Indiquez la source (le tournoi).").max(80),
  eventDate: z.coerce.date(),
  format: z.string().trim().max(80).optional(),
  /** Le nombre de decks importables que la vérification a montrés. */
  expected: z.number().int().min(0).optional(),
});

/** Un collage trop long se refuse avec son message ; toute autre erreur remonte. */
function tooLarge(error: unknown): { ok: false; error: string } {
  if (error instanceof MetaImportTooLargeError) return { ok: false, error: error.message };
  throw error;
}

export type MetaImportFormValues = z.input<typeof importSchema>;

/** Lit et vérifie le collage, sans rien écrire. */
export async function previewMetaImportAction(
  values: MetaImportFormValues
): Promise<ActionResult<{ rows: PublicMetaImportRow[] }>> {
  if (!(await requireMetaManager())) return { ok: false, error: "Accès refusé." };

  const parsed = importSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const game = await getGameBySlugOrId(parsed.data.gameId);
  if (!game) return { ok: false, error: "Jeu introuvable." };

  try {
    const rows = await resolveMetaImport(game, parsed.data.input, { source: parsed.data.source });
    return { ok: true, rows: toPublicRows(rows) };
  } catch (error) {
    return tooLarge(error);
  }
}

/** Importe les decks prêts du collage, en decks publics. */
export async function importMetaDecksAction(
  values: MetaImportFormValues
): Promise<
  | ActionResult<{ created: number; batchId: string; rows: PublicMetaImportRow[] }>
  | { ok: false; error: string; rows: PublicMetaImportRow[] }
> {
  const session = await requireMetaManager();
  if (!session) return { ok: false, error: "Accès refusé." };

  const parsed = importSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const game = await getGameBySlugOrId(parsed.data.gameId);
  if (!game) return { ok: false, error: "Jeu introuvable." };

  let result;
  try {
    result = await importMetaDecks(
      {
        game,
        input: parsed.data.input,
        source: parsed.data.source,
        eventDate: parsed.data.eventDate,
        format: parsed.data.format || undefined,
        expected: parsed.data.expected,
      },
      session.user.id
    );
  } catch (error) {
    return tooLarge(error);
  }

  if (!result.ok) {
    return {
      ok: false,
      error: "Le collage ne donne plus les mêmes decks qu'à la vérification (un deck Piltover a pu changer). Rien n'a été importé : vérifiez à nouveau.",
      rows: toPublicRows(result.rows),
    };
  }

  refreshMeta(game.id);
  return { ok: true, created: result.created.length, batchId: result.batchId, rows: toPublicRows(result.rows) };
}

/** Retire un deck de la méta : supprimé s'il a été importé, démarqué sinon. */
export async function removeMetaDeckAction(deckId: string): Promise<ActionResult<{ deleted: boolean }>> {
  if (!(await requireMetaManager())) return { ok: false, error: "Accès refusé." };

  const result = await removeMetaDeck(deckId);
  if (!result) return { ok: false, error: "Deck introuvable." };

  refreshMeta(result.gameId);
  revalidatePath(`/decks/${deckId}`);
  return { ok: true, deleted: result.deleted };
}

/** Annule un import entier. */
export async function removeMetaBatchAction(batchId: string): Promise<ActionResult<{ deleted: number }>> {
  if (!(await requireMetaManager())) return { ok: false, error: "Accès refusé." };

  const result = await removeMetaBatch(batchId);
  if (result.gameId) refreshMeta(result.gameId);
  return { ok: true, deleted: result.deleted };
}

const markSchema = z.object({
  deckId: z.string().min(1),
  source: z.string().trim().min(1, "Indiquez la source (le tournoi).").max(80),
  eventDate: z.coerce.date(),
  placement: z.string().trim().max(40).optional(),
});

/** Fait compter le deck public d'un joueur dans la méta. */
export async function markDeckAsMetaAction(values: z.input<typeof markSchema>): Promise<ActionResult<object>> {
  const session = await requireMetaManager();
  if (!session) return { ok: false, error: "Accès refusé." };

  const parsed = markSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const result = await markDeckAsMeta(
    parsed.data.deckId,
    { source: parsed.data.source, eventDate: parsed.data.eventDate, placement: parsed.data.placement || undefined },
    session.user.id
  );
  if (!result.ok) return result;

  refreshMeta(result.deck.gameId);
  revalidatePath(`/decks/${parsed.data.deckId}`);
  return { ok: true };
}

const settingsSchema = z.object({
  gameId: z.string().min(1),
  stapleThreshold: z.coerce.number().min(0.05).max(1),
  minDecksPerDomain: z.coerce.number().int().min(1).max(10_000),
  defaultPeriodDays: z.coerce.number().int().min(0).max(3650),
});

/** Enregistre les réglages des statistiques d'un jeu. */
export async function saveMetaSettingsAction(values: z.input<typeof settingsSchema>): Promise<ActionResult<object>> {
  if (!(await requireMetaManager())) return { ok: false, error: "Accès refusé." };

  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const game = await getGameBySlugOrId(parsed.data.gameId);
  if (!game) return { ok: false, error: "Jeu introuvable." };

  // Seules les valeurs qui s'écartent des défauts s'enregistrent : un défaut
  // qui change plus tard s'applique alors aux jeux qui ne l'avaient pas touché.
  const { gameId: _gameId, ...settings } = parsed.data;
  const resolved = resolveMetaSettings(settings);
  const overrides = Object.fromEntries(
    (Object.keys(resolved) as (keyof ResolvedMetaSettings)[])
      .filter((key) => resolved[key] !== DEFAULT_META_SETTINGS[key])
      .map((key) => [key, resolved[key]])
  ) as GameMetaSettings;
  await setGameMetaSettings(game.id, Object.keys(overrides).length > 0 ? overrides : null);

  updateTag(GAMES_CACHE_TAG);
  refreshMeta(game.id);
  return { ok: true };
}
