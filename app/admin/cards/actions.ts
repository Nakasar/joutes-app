"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/middleware/admin";
import {
  cardIdExists,
  createCard,
  getGameCard,
  iterateGameCardsForIndexing,
  searchGameCards,
  updateCard,
  type CardAttributeValue,
  type GameCardSummary,
} from "@/lib/db/cards";
import { getGameById } from "@/lib/db/games";
import { cardSchema } from "@/lib/schemas/card.schema";
import { gameIdSchema } from "@/lib/schemas/game.schema";
import { withUniquePrintingIds } from "@/lib/constants/card-ids";
import meilisearch, { cardIndexFor, type CardIndexConfig } from "@/lib/meilisearch";

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
  foil?: boolean;
  printings?: { id?: string; name: string; foil?: boolean; image?: string }[];
  attributes?: Record<string, CardAttributeValue>;
};

/**
 * Champs communs écrits en base à partir du formulaire. `foil` et `printings`
 * ne sont écrits que s'ils portent une information : sinon ils valent
 * `undefined`, ce qui les retire du document à la modification.
 */
function toCoreCardFields(card: z.infer<typeof cardSchema>) {
  const printings = withUniquePrintingIds(card.printings ?? []).map((printing) => ({
    id: printing.id,
    name: printing.name,
    ...(printing.foil ? { foil: true } : {}),
    ...(printing.image ? { image: printing.image } : {}),
  }));

  return {
    id: card.id,
    name: card.name,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    lang: card.lang,
    image: card.image || undefined,
    text: card.text || undefined,
    foil: card.foil ? true : undefined,
    printings: printings.length > 0 ? printings : undefined,
  };
}

/**
 * L'identifiant d'un document Meilisearch n'accepte pas `*` (utilisé par
 * certaines variantes de numéro de collection), là où l'identifiant en base le
 * garde : on reprend la correspondance des scripts d'import, qui conservent
 * l'identifiant réel dans `cardId`.
 */
function searchDocumentId(cardId: string): string {
  return cardId.replaceAll("*", "s");
}

/**
 * Le minimum dont on a besoin pour construire un document de recherche. Aussi
 * bien une carte validée par le formulaire qu'une carte relue en base s'y
 * conforment : les deux chemins produisent donc exactement le même document.
 */
type SearchableCard = {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  lang?: string;
  image?: string;
  text?: string;
  foil?: boolean;
  printings?: { id?: string; name: string; foil?: boolean; image?: string }[];
  attributes?: Record<string, CardAttributeValue>;
};

function toSearchDocument(
  indexConfig: CardIndexConfig,
  card: SearchableCard
): Record<string, unknown> {
  return {
    ...card.attributes,
    id: searchDocumentId(card.id),
    cardId: card.id,
    name: card.name,
    lang: card.lang,
    image: card.image || undefined,
    text: card.text || undefined,
    foil: card.foil || undefined,
    // Les variantes ne sont saisies que par ce formulaire, qui réindexe la
    // carte : la recherche est donc une source fiable pour les écrans qui
    // ajoutent un exemplaire depuis un résultat de recherche.
    printings: card.printings?.length ? withUniquePrintingIds(card.printings) : undefined,
    // Écrits seulement s'ils sont renseignés : l'index peut les porter sous un
    // autre nom que la base (`set` chez Magic), qui est alors relu comme un
    // attribut de jeu — le mapper à `undefined` l'effacerait du document.
    ...(card.setCode !== undefined && { [indexConfig.keys.set]: card.setCode }),
    ...(card.collectorNumber !== undefined && {
      [indexConfig.keys.collectorNumber]: card.collectorNumber,
    }),
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
  const indexConfig = cardIndexFor(gameSlug);
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

export type ReindexResult = {
  success: boolean;
  error?: string;
  /** Nombre de cartes envoyées à l'index. */
  sent?: number;
};

/** Cartes envoyées par requête à Meilisearch : assez pour limiter les aller-retours, assez peu pour garder des requêtes de taille raisonnable. */
const REINDEX_BATCH_SIZE = 500;

/**
 * Repousse toutes les cartes du jeu dans l'index de recherche. Utile après une
 * modification en masse en base, ou quand l'index a divergé.
 *
 * Les lots sont mis en file sans attendre que Meilisearch les ait traités :
 * l'indexation d'un gros catalogue dépasserait la durée d'une action serveur.
 * L'écriture est un upsert par identifiant — l'index n'est jamais vidé, donc
 * la recherche reste servie pendant l'opération.
 */
export async function reindexGameCards(gameId: string): Promise<ReindexResult> {
  try {
    await requireAdmin();

    const validatedGameId = gameIdSchema.parse(gameId);
    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    const indexConfig = cardIndexFor(game.slug);
    if (!indexConfig) {
      return { success: false, error: "Ce jeu n'a pas d'index de recherche : il n'y a rien à mettre à jour." };
    }

    const index = meilisearch.index(indexConfig.name);
    let sent = 0;
    for await (const batch of iterateGameCardsForIndexing(new ObjectId(validatedGameId), REINDEX_BATCH_SIZE)) {
      await index.addDocuments(batch.map((card) => toSearchDocument(indexConfig, card)));
      sent += batch.length;
    }

    return { success: true, sent };
  } catch (error) {
    console.error("Erreur lors de la réindexation des cartes:", error);
    return { success: false, error: "La mise à jour de l'index a échoué." };
  }
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
      { ...toCoreCardFields(card), attributes: card.attributes },
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
      { ...toCoreCardFields(card), attributes: card.attributes },
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
