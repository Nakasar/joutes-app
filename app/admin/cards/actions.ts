"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/middleware/admin";
import {
  cardIdExists,
  createCard,
  getGameCard,
  searchGameCards,
  updateCard,
  type CardAttributeValue,
  type GameCardSummary,
} from "@/lib/db/cards";
import { getGameById } from "@/lib/db/games";
import { cardSchema } from "@/lib/schemas/card.schema";
import { gameIdSchema } from "@/lib/schemas/game.schema";
import meilisearch, { indexes } from "@/lib/meilisearch";

export type SaveCardResult = {
  success: boolean;
  error?: string;
  /** La carte est en base mais la recherche n'est pas à jour. */
  warning?: string;
  cardId?: string;
};

type CardPayload = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  attributes?: Record<string, CardAttributeValue>;
};

/**
 * L'identifiant d'un document Meilisearch n'accepte pas `*` (utilisé par
 * certaines variantes de numéro de collection), là où l'identifiant en base le
 * garde : on reprend la correspondance des scripts d'import, qui conservent
 * l'identifiant réel dans `cardId`.
 */
function searchDocumentId(cardId: string): string {
  return cardId.replaceAll("*", "s");
}

function toSearchDocument(
  indexConfig: (typeof indexes)[string],
  card: z.infer<typeof cardSchema>
): Record<string, unknown> {
  return {
    ...card.attributes,
    id: searchDocumentId(card.id),
    cardId: card.id,
    name: card.name,
    lang: card.lang,
    image: card.image || undefined,
    text: card.text || undefined,
    [indexConfig.keys.set]: card.setCode,
    [indexConfig.keys.collectorNumber]: card.collectorNumber,
  };
}

/**
 * Indexe la carte pour la recherche. La base fait foi : un échec n'annule pas
 * l'écriture, il est seulement signalé. `previousCardId` permet de retirer
 * l'ancien document quand l'identifiant a changé.
 */
async function indexCard(
  gameSlug: string | undefined,
  card: z.infer<typeof cardSchema>,
  previousCardId?: string
): Promise<string | undefined> {
  const indexConfig = gameSlug ? indexes[gameSlug] : undefined;
  if (!indexConfig) {
    return "La carte a été enregistrée ; ce jeu n'a pas d'index de recherche, elle n'apparaîtra pas dans la recherche de cartes.";
  }

  try {
    const index = meilisearch.index(indexConfig.name);
    if (previousCardId && previousCardId !== card.id) {
      await index.deleteDocument(searchDocumentId(previousCardId));
    }
    await index.addDocuments([toSearchDocument(indexConfig, card)]);
    return undefined;
  } catch (error) {
    console.error("Erreur lors de l'indexation de la carte:", error);
    return "La carte a été enregistrée mais n'a pas pu être indexée : la recherche n'est pas à jour.";
  }
}

function revalidateCard(gameSlugOrId: string, ...cardIds: string[]) {
  revalidatePath("/admin/cards");
  revalidatePath(`/games/${gameSlugOrId}/cards`);
  for (const cardId of new Set(cardIds)) {
    revalidatePath(`/games/${gameSlugOrId}/cards/${cardId}`);
  }
}

export async function checkCardIdAvailability(
  gameId: string,
  cardId: string,
  /** Identifiant actuel en édition : il ne doit pas se signaler lui-même comme pris. */
  currentCardId?: string
): Promise<{ available: boolean }> {
  await requireAdmin();

  const validatedGameId = gameIdSchema.parse(gameId);
  const trimmed = cardId.trim();
  if (!trimmed) {
    return { available: false };
  }
  if (currentCardId && trimmed === currentCardId) {
    return { available: true };
  }

  return { available: !(await cardIdExists(new ObjectId(validatedGameId), trimmed)) };
}

export async function searchCards(gameId: string, query: string): Promise<GameCardSummary[]> {
  await requireAdmin();

  const validatedGameId = gameIdSchema.parse(gameId);
  return searchGameCards(new ObjectId(validatedGameId), query);
}

export async function createGameCard(gameId: string, data: CardPayload): Promise<SaveCardResult> {
  try {
    const session = await requireAdmin();

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
      return { success: false, error: `La carte « ${card.id} » existe déjà pour ce jeu.` };
    }

    await createCard(
      new ObjectId(validatedGameId),
      {
        id: card.id,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        lang: card.lang,
        image: card.image || undefined,
        text: card.text || undefined,
        attributes: card.attributes,
      },
      session.user.id
    );

    const warning = await indexCard(game.slug, card);
    revalidateCard(game.slug ?? game.id, card.id);

    return { success: true, warning, cardId: card.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la création de la carte:", error);
    return { success: false, error: "Erreur lors de la création de la carte" };
  }
}

export async function updateGameCard(
  gameId: string,
  currentCardId: string,
  data: CardPayload
): Promise<SaveCardResult> {
  try {
    const session = await requireAdmin();

    const validatedGameId = gameIdSchema.parse(gameId);
    const card = cardSchema.parse(data);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    const existing = await getGameCard(new ObjectId(validatedGameId), currentCardId);
    if (!existing) {
      return { success: false, error: `La carte « ${currentCardId} » n'existe pas pour ce jeu.` };
    }

    // Même vérification qu'à la création dès que l'identifiant change.
    if (card.id !== currentCardId && (await cardIdExists(new ObjectId(validatedGameId), card.id))) {
      return { success: false, error: `La carte « ${card.id} » existe déjà pour ce jeu.` };
    }

    // Un attribut vidé dans le formulaire doit disparaître du document, pas
    // seulement être ignoré.
    const submittedKeys = new Set(Object.keys(card.attributes ?? {}));
    const removedAttributes = Object.keys(existing.attributes).filter((key) => !submittedKeys.has(key));

    await updateCard(
      new ObjectId(validatedGameId),
      currentCardId,
      {
        id: card.id,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        lang: card.lang,
        image: card.image || undefined,
        text: card.text || undefined,
        attributes: card.attributes,
      },
      { removedAttributes, editedBy: session.user.id }
    );

    const warning = await indexCard(game.slug, card, currentCardId);
    revalidateCard(game.slug ?? game.id, card.id, currentCardId);

    return { success: true, warning, cardId: card.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la modification de la carte:", error);
    return { success: false, error: "Erreur lors de la modification de la carte" };
  }
}
