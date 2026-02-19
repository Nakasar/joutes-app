"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  createDeck,
  updateDeck,
  deleteDeck,
  getDeckById,
} from "@/lib/db/decks";
import { deckSchema, deckUpdateSchema, deckIdSchema } from "@/lib/schemas/deck.schema";
import { Deck } from "@/lib/types/Deck";

export async function createDeckAction(data: unknown): Promise<{ success: boolean; deck?: Deck; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Valider les données
    const validationResult = deckSchema.safeParse(data);
    if (!validationResult.success) {
      return { 
        success: false, 
        error: validationResult.error.issues[0]?.message || "Données invalides" 
      };
    }

    const deckData = validationResult.data;

    // Créer le deck
    const deck = await createDeck({
      playerId: session.user.id,
      gameId: deckData.gameId,
      name: deckData.name,
      url: deckData.url,
      description: deckData.description,
      visibility: deckData.visibility,
    });

    revalidatePath("/decks");
    return { success: true, deck };
  } catch (error) {
    console.error("Erreur lors de la création du deck:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur serveur" };
  }
}

export async function updateDeckAction(
  deckId: string,
  data: unknown
): Promise<{ success: boolean; deck?: Deck; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Valider l'ID du deck
    const deckIdValidation = deckIdSchema.safeParse(deckId);
    if (!deckIdValidation.success) {
      return { success: false, error: "ID de deck invalide" };
    }

    // Valider les données
    const validationResult = deckUpdateSchema.safeParse(data);
    if (!validationResult.success) {
      return { 
        success: false, 
        error: validationResult.error.issues[0]?.message || "Données invalides" 
      };
    }

    const updates = validationResult.data;

    // Mettre à jour le deck
    const deck = await updateDeck(deckId, session.user.id, updates);

    if (!deck) {
      return { success: false, error: "Deck non trouvé ou vous n'avez pas l'autorisation de le modifier" };
    }

    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    revalidatePath(`/decks/${deckId}/edit`);
    return { success: true, deck };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du deck:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur serveur" };
  }
}

export async function deleteDeckAction(deckId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Valider l'ID du deck
    const deckIdValidation = deckIdSchema.safeParse(deckId);
    if (!deckIdValidation.success) {
      return { success: false, error: "ID de deck invalide" };
    }

    const result = await deleteDeck(deckId, session.user.id);

    if (!result) {
      return { success: false, error: "Deck non trouvé ou vous n'avez pas l'autorisation de le supprimer" };
    }

    revalidatePath("/decks");
    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du deck:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function getDeckAction(deckId: string): Promise<{ success: boolean; deck?: Deck; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // Valider l'ID du deck
    const deckIdValidation = deckIdSchema.safeParse(deckId);
    if (!deckIdValidation.success) {
      return { success: false, error: "ID de deck invalide" };
    }

    const deck = await getDeckById(deckId);

    if (!deck) {
      return { success: false, error: "Deck non trouvé" };
    }

    // Vérifier les permissions : le deck doit être public ou appartenir à l'utilisateur connecté
    if (deck.visibility === "private" && deck.playerId !== session?.user?.id) {
      return { success: false, error: "Vous n'avez pas l'autorisation de voir ce deck" };
    }

    return { success: true, deck };
  } catch (error) {
    console.error("Erreur lors de la récupération du deck:", error);
    return { success: false, error: "Erreur serveur" };
  }
}
