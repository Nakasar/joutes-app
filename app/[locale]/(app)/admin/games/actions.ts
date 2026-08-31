"use server";

import { requireAdmin } from "@/lib/middleware/admin.ts";
import { Game } from "@/lib/types/Game.ts";
import { revalidatePath, updateTag } from "next/cache";
import {
  gameSchema,
  gameIdSchema,
  gameFeaturesSchema,
  gameDeckBuilderSchema,
} from "@/lib/schemas/game.schema.ts";
import { z } from "zod";
import * as gamesDb from "@/lib/db/games.ts";
import { GAMES_CACHE_TAG } from "@/lib/db/games-cached.ts";
import { mergeGameFeatures, type GameFeatureKey } from "@/lib/constants/game-features.ts";

export async function getGames(): Promise<Game[]> {
  try {
    await requireAdmin();
    return await gamesDb.getAllGames();
  } catch (error) {
    throw new Error("Non autorisé");
  }
}

type GameFormData = {
  name: string;
  slug?: string;
  icon?: string;
  banner?: string;
  description: string;
  type: string;
  features?: Partial<Record<GameFeatureKey, boolean>>;
};

export async function createGame(data: GameFormData) {
  try {
    await requireAdmin();

    // Valider les données avec Zod
    const validatedData = gameSchema.parse(data);

    const newGame = await gamesDb.createGame({
      ...validatedData,
      features: mergeGameFeatures(validatedData.features, undefined),
      metadata: {},
      images: { banner: validatedData.banner },
      longDescription: "",
      color: '#FFFFFF',
      note: {},
      gallery: [],
      links: {},
      stats: {
        communityRating: 0,
        popularityScore: 0,
      },
    });
    // Les pages publiques lisent le catalogue en cache : sans cette invalidation,
    // une édition n'y apparaîtrait qu'à l'expiration de `cacheLife`.
    updateTag(GAMES_CACHE_TAG);
    revalidatePath("/admin/games");
    revalidatePath(`/games`);
    revalidatePath(`/games/${newGame.slug ?? newGame.id}`);
    
    return { success: true, game: newGame };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la création du jeu:", error);
    return { success: false, error: "Erreur lors de la création du jeu" };
  }
}

export async function updateGame(id: string, data: GameFormData) {
  try {
    await requireAdmin();

    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);
    
    // Valider les données avec Zod
    const validatedData = gameSchema.parse(data);

    const game = await gamesDb.getGameById(id);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    const updated = await gamesDb.updateGame(validatedId, {
      ...validatedData,
      features: mergeGameFeatures(validatedData.features, game.features),
    });
    
    if (!updated) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    // Les pages publiques lisent le catalogue en cache : sans cette invalidation,
    // une édition n'y apparaîtrait qu'à l'expiration de `cacheLife`.
    updateTag(GAMES_CACHE_TAG);
    revalidatePath("/admin/games");
    // La fiche d'administration est adressée par le slug : changer celui-ci
    // laisse l'ancienne adresse en cache, la nouvelle n'ayant jamais été rendue.
    revalidatePath(`/admin/games/${game.slug ?? game.id}`);
    revalidatePath(`/admin/games/${validatedData.slug ?? game.id}`);
    revalidatePath("/admin/lairs");
    revalidatePath(`/games`);
    revalidatePath(`/games/${game.slug ?? game.id}`);
    revalidatePath(`/games/${validatedData.slug ?? game.id}`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "Données invalides" 
      };
    }
    console.error("Erreur lors de la modification du jeu:", error);
    return { success: false, error: "Erreur lors de la modification du jeu" };
  }
}

export async function deleteGame(id: string) {
  try {
    await requireAdmin();
    
    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);

    const game = await gamesDb.getGameById(id);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    const deleted = await gamesDb.deleteGame(validatedId);
    
    if (!deleted) {
      return { success: false, error: "Jeu non trouvé" };
    }
    
    // Les pages publiques lisent le catalogue en cache : sans cette invalidation,
    // une édition n'y apparaîtrait qu'à l'expiration de `cacheLife`.
    updateTag(GAMES_CACHE_TAG);
    revalidatePath("/admin/games");
    revalidatePath("/admin/lairs");
    revalidatePath(`/games`);
    revalidatePath(`/games/${game.slug ?? game.id}`);
    
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.issues[0]?.message || "ID invalide" 
      };
    }
    console.error("Erreur lors de la suppression du jeu:", error);
    return { success: false, error: "Erreur lors de la suppression du jeu" };
  }
}

/**
 * Les seuls fanions de fonctionnalités, sans le reste de la fiche.
 *
 * Un onglet qui n'affiche que les cases à cocher ne doit pas avoir à renvoyer
 * le nom et la description du jeu pour satisfaire `gameSchema` : il les
 * réécrirait à l'identique, et une modification faite entre-temps depuis un
 * autre onglet serait perdue.
 */
export async function updateGameFeatures(
  id: string,
  features: Partial<Record<GameFeatureKey, boolean>>
) {
  try {
    await requireAdmin();

    const validatedId = gameIdSchema.parse(id);
    const validatedFeatures = gameFeaturesSchema.parse(features);

    const game = await gamesDb.getGameById(validatedId);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    await gamesDb.updateGame(validatedId, {
      features: mergeGameFeatures(validatedFeatures, game.features),
    });

    updateTag(GAMES_CACHE_TAG);
    revalidatePath("/admin/games");
    revalidatePath(`/admin/games/${game.slug ?? game.id}`);
    revalidatePath(`/games`);
    revalidatePath(`/games/${game.slug ?? game.id}`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la mise à jour des fonctionnalités:", error);
    return { success: false, error: "Erreur lors de la mise à jour des fonctionnalités" };
  }
}

/**
 * Réglages du deck builder.
 *
 * Une liste de zones vide vaut retrait du champ : c'est le seul moyen de rendre
 * un jeu aux zones livrées avec la plateforme après les avoir réglées, et un
 * `deckBuilder: { zones: [] }` laissé en base donnerait un éditeur sans aucune
 * zone où poser une carte.
 */
export async function setGameDeckBuilder(id: string, deckBuilder: unknown) {
  try {
    await requireAdmin();

    const validatedId = gameIdSchema.parse(id);
    const validated = gameDeckBuilderSchema.parse(deckBuilder);

    const game = await gamesDb.getGameById(validatedId);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    const updated = await gamesDb.setGameDeckBuilder(
      validatedId,
      validated.zones.length > 0 ? validated : null
    );

    if (!updated) {
      return { success: false, error: "Jeu non trouvé" };
    }

    updateTag(GAMES_CACHE_TAG);
    revalidatePath("/admin/games");
    revalidatePath(`/admin/games/${game.slug ?? game.id}`);
    // Les decks affichent leurs zones : la fiche et l'éditeur les relisent.
    revalidatePath("/decks");

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Réglages invalides" };
    }
    console.error("Erreur lors de la mise à jour du deck builder:", error);
    return { success: false, error: "Erreur lors de la mise à jour du deck builder" };
  }
}

export async function updateGameFeaturedLairs(
  id: string,
  featuredLairs: string[]
) {
  try {
    await requireAdmin();

    // Valider l'ID
    const validatedId = gameIdSchema.parse(id);

    const game = await gamesDb.getGameById(id);

    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    // Valider les IDs des lairs
    const validatedLairIds = z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).parse(featuredLairs);

    const updated = await gamesDb.updateGame(validatedId, { featuredLairs: validatedLairIds });

    if (!updated) {
      return { success: false, error: "Jeu non trouvé" };
    }

    // Les pages publiques lisent le catalogue en cache : sans cette invalidation,
    // une édition n'y apparaîtrait qu'à l'expiration de `cacheLife`.
    updateTag(GAMES_CACHE_TAG);
    revalidatePath("/admin/games");
    revalidatePath(`/games/${game.slug ?? game.id}`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "Données invalides"
      };
    }
    console.error("Erreur lors de la mise à jour des lieux mis en avant:", error);
    return { success: false, error: "Erreur lors de la mise à jour des lieux mis en avant" };
  }
}
