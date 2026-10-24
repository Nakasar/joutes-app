"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getGameById } from "@/lib/db/games.ts";
import { getGameCardsForIndexing } from "@/lib/db/cards.ts";
import { saveCardGlossaryField, saveCardTranslation } from "@/lib/db/card-translations.ts";
import { gameIdSchema } from "@/lib/schemas/game.schema.ts";
import { isCardLanguage } from "@/lib/constants/card-languages.ts";
import { toSearchDocument } from "@/lib/cards/search-document.ts";
import meilisearch, { cardIndexFor } from "@/lib/meilisearch.ts";

export type TranslationActionResult = {
  success: boolean;
  error?: string;
  /** Enregistré, mais la recherche n'est pas à jour. */
  warning?: string;
};

const languageSchema = z.string().refine(isCardLanguage, "Langue inconnue");

const translationSchema = z.object({
  name: z.string().max(200, "Le nom est trop long").optional(),
  text: z.string().max(5000, "Le texte est trop long").optional(),
  status: z.enum(["draft", "done"]),
});

/**
 * Enregistre la traduction d'une carte et la repousse dans l'index de
 * recherche, qui porte les noms traduits (recherche, scanner).
 */
export async function saveTranslation(
  gameId: string,
  lang: string,
  cardId: string,
  input: { name?: string; text?: string; status: "draft" | "done" }
): Promise<TranslationActionResult> {
  try {
    const session = await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    const validatedLang = languageSchema.parse(lang);
    const data = translationSchema.parse(input);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    const saved = await saveCardTranslation(new ObjectId(validatedGameId), cardId, validatedLang, data, session.user.id);
    if (!saved) {
      return { success: false, error: `La carte « ${cardId} » n'existe pas pour ce jeu.` };
    }

    let warning: string | undefined;
    const indexConfig = cardIndexFor(game.slug);
    if (indexConfig) {
      try {
        const cards = await getGameCardsForIndexing(new ObjectId(validatedGameId), [cardId]);
        if (cards.length > 0) {
          await meilisearch.index(indexConfig.name).addDocuments(cards.map((card) => toSearchDocument(indexConfig, card)));
        }
      } catch (error) {
        console.error("Erreur lors de l'indexation de la traduction:", error);
        warning = "La traduction est enregistrée, mais la recherche ne la connaît pas encore.";
      }
    }

    revalidatePath("/admin/translations");
    revalidatePath(`/games/${game.slug ?? game.id}/cards/${cardId}`);

    return { success: true, warning };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de l'enregistrement de la traduction:", error);
    return { success: false, error: "La traduction n'a pas pu être enregistrée." };
  }
}

const glossarySchema = z.object({
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Catégorie invalide"),
  entries: z
    .array(
      z.object({
        en: z.string().min(1).max(200),
        value: z.string().max(200),
        reminder: z.string().max(1000).optional(),
      })
    )
    .max(1000),
});

export async function saveGlossary(
  gameId: string,
  lang: string,
  field: string,
  entries: { en: string; value: string; reminder?: string }[]
): Promise<TranslationActionResult> {
  try {
    const session = await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    const validatedLang = languageSchema.parse(lang);
    const data = glossarySchema.parse({ field, entries });

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    await saveCardGlossaryField(new ObjectId(validatedGameId), validatedLang, data.field, data.entries, session.user.id);

    // Le glossaire se lit à l'affichage : il n'y a rien à réindexer, seulement
    // les écrans qui le montrent à rafraîchir.
    revalidatePath("/admin/translations");
    revalidatePath(`/games/${game.slug ?? game.id}/cards`, "layout");

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de l'enregistrement du glossaire:", error);
    return { success: false, error: "Le glossaire n'a pas pu être enregistré." };
  }
}
