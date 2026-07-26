"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/middleware/admin";
import { cardIdExists, createCard, type CardAttributeValue } from "@/lib/db/cards";
import { getGameById } from "@/lib/db/games";
import { cardSchema } from "@/lib/schemas/card.schema";
import { gameIdSchema } from "@/lib/schemas/game.schema";
import meilisearch, { indexes } from "@/lib/meilisearch";

export type CreateCardResult = {
  success: boolean;
  error?: string;
  /** La carte est en base mais n'a pas pu être indexée : elle n'apparaîtra pas dans la recherche. */
  warning?: string;
  cardId?: string;
};

/**
 * L'identifiant d'un document Meilisearch n'accepte pas `*` (utilisé par
 * certaines variantes de numéro de collection), là où l'identifiant en base le
 * garde : on reprend la correspondance des scripts d'import, qui conservent
 * l'identifiant réel dans `cardId`.
 */
function toSearchDocument(
  indexConfig: (typeof indexes)[string],
  card: z.infer<typeof cardSchema>
): Record<string, unknown> {
  return {
    ...card.attributes,
    id: card.id.replaceAll("*", "s"),
    cardId: card.id,
    name: card.name,
    lang: card.lang,
    image: card.image || undefined,
    text: card.text || undefined,
    [indexConfig.keys.set]: card.setCode,
    [indexConfig.keys.collectorNumber]: card.collectorNumber,
  };
}

export async function checkCardIdAvailability(gameId: string, cardId: string): Promise<{ available: boolean }> {
  await requireAdmin();

  const validatedGameId = gameIdSchema.parse(gameId);
  const trimmed = cardId.trim();
  if (!trimmed) {
    return { available: false };
  }

  return { available: !(await cardIdExists(new ObjectId(validatedGameId), trimmed)) };
}

export async function createGameCard(
  gameId: string,
  data: {
    id: string;
    name: string;
    setCode: string;
    collectorNumber: string;
    lang: string;
    image?: string;
    text?: string;
    attributes?: Record<string, CardAttributeValue>;
  }
): Promise<CreateCardResult> {
  try {
    await requireAdmin();

    const validatedGameId = gameIdSchema.parse(gameId);
    const card = cardSchema.parse(data);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    // Vérification demandée : deux cartes d'un même jeu ne peuvent pas porter le
    // même identifiant (SFD + 125 -> SFD125), sous peine de rendre ambigus les
    // liens de carte, la collection et les boosters qui s'y réfèrent.
    if (await cardIdExists(new ObjectId(validatedGameId), card.id)) {
      return {
        success: false,
        error: `La carte « ${card.id} » existe déjà pour ce jeu.`,
      };
    }

    await createCard(new ObjectId(validatedGameId), {
      id: card.id,
      name: card.name,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      lang: card.lang,
      image: card.image || undefined,
      text: card.text || undefined,
      attributes: card.attributes,
    });

    // La carte est en base (source de vérité) : un échec d'indexation ne doit
    // pas annuler l'ajout, seulement être signalé.
    let warning: string | undefined;
    const indexConfig = game.slug ? indexes[game.slug] : undefined;
    if (indexConfig) {
      try {
        await meilisearch.index(indexConfig.name).addDocuments([toSearchDocument(indexConfig, card)]);
      } catch (error) {
        console.error("Erreur lors de l'indexation de la carte:", error);
        warning = "La carte a été enregistrée mais n'a pas pu être indexée : elle n'apparaîtra pas tout de suite dans la recherche.";
      }
    } else {
      warning = "La carte a été enregistrée ; ce jeu n'a pas d'index de recherche, elle n'apparaîtra pas dans la recherche de cartes.";
    }

    revalidatePath("/admin/cards");
    revalidatePath(`/games/${game.slug ?? game.id}/cards`);
    revalidatePath(`/games/${game.slug ?? game.id}/cards/${card.id}`);

    return { success: true, warning, cardId: card.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la création de la carte:", error);
    return { success: false, error: "Erreur lors de la création de la carte" };
  }
}
