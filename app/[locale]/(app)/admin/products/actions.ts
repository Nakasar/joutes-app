"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import {
  countGameProducts,
  createProduct,
  deleteProduct,
  getContainersReferencing,
  getGameProduct,
  getReferencedProducts,
  productIdExists,
  searchGameProducts,
  updateProduct,
  type GameProductSummary,
} from "@/lib/db/products.ts";
import { getGameById, setCurrentProductEdition } from "@/lib/db/games.ts";
import { currentProductEditionSchema, gameIdSchema } from "@/lib/schemas/game.schema.ts";
import { productSchema } from "@/lib/schemas/product.schema.ts";
import { describeContentIssue, validateContents } from "@/lib/products/contents.ts";
import type { ProductAttributeValue } from "@/lib/types/product.ts";

export type SaveProductResult = {
  success: boolean;
  error?: string;
  productId?: string;
};

function revalidateProduct(gameSlug: string | undefined) {
  revalidatePath("/admin/products");
  if (gameSlug) {
    revalidatePath(`/collection/${gameSlug}/products`);
    revalidatePath(`/games/${gameSlug}/products`);
  }
}

/**
 * Vérifie qu'une composition tient debout avant de l'écrire : pas
 * d'auto-référence, pas de référence inconnue, et surtout pas de contenant à
 * l'intérieur d'un contenant. Rend un message qui **nomme le fautif** — coller
 * une liste et lire « données invalides » ne dit pas quoi corriger.
 */
async function checkContents(
  gameObjId: ObjectId,
  productId: string,
  contents: { productId: string; quantity: number }[] | undefined
): Promise<{ contents: { productId: string; quantity: number }[]; error?: string }> {
  if (!contents || contents.length === 0) {
    return { contents: [] };
  }

  const referenced = await getReferencedProducts(gameObjId, contents.map((line) => line.productId));
  const validation = validateContents(productId, contents, referenced);

  if (validation.issues.length > 0) {
    return {
      contents: validation.contents,
      error: validation.issues.map(describeContentIssue).join(" "),
    };
  }

  return { contents: validation.contents };
}

export async function checkProductIdAvailability(
  gameId: string,
  productId: string
): Promise<{ available: boolean }> {
  try {
    await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    const trimmed = productId.trim();
    if (!trimmed) {
      return { available: false };
    }

    const exists = await productIdExists(new ObjectId(validatedGameId), trimmed);
    return { available: !exists };
  } catch {
    return { available: false };
  }
}

export async function searchProducts(
  gameId: string,
  query: string,
  options?: { leavesOnly?: boolean }
): Promise<GameProductSummary[]> {
  try {
    await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    return await searchGameProducts(new ObjectId(validatedGameId), query, {
      leavesOnly: options?.leavesOnly,
    });
  } catch (error) {
    console.error("Erreur lors de la recherche de produits:", error);
    return [];
  }
}

export async function createGameProduct(
  gameId: string,
  input: unknown
): Promise<SaveProductResult> {
  try {
    const session = await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    const product = productSchema.parse(input);
    const gameObjId = new ObjectId(validatedGameId);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu introuvable" };
    }

    if (await productIdExists(gameObjId, product.id)) {
      return { success: false, error: `Le produit « ${product.id} » existe déjà pour ${game.name}` };
    }

    const checked = await checkContents(gameObjId, product.id, product.contents);
    if (checked.error) {
      return { success: false, error: checked.error };
    }

    await createProduct(
      gameObjId,
      {
        id: product.id,
        name: product.name,
        kind: product.kind,
        image: product.image || undefined,
        setCode: product.setCode || undefined,
        contents: checked.contents,
        attributes: product.attributes as Record<string, ProductAttributeValue> | undefined,
      },
      session.user.id
    );

    revalidateProduct(game.slug);
    return { success: true, productId: product.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la création du produit:", error);
    return { success: false, error: "Erreur lors de la création du produit" };
  }
}

export async function updateGameProduct(
  gameId: string,
  currentId: string,
  input: unknown
): Promise<SaveProductResult> {
  try {
    const session = await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    // L'identifiant fourni est ignoré : il est figé après création (il est
    // référencé par les exemplaires en collection et par le contenu des autres
    // produits). Le formulaire le verrouille, la validation le confirme.
    const product = productSchema.parse({ ...(input as object), id: currentId });
    const gameObjId = new ObjectId(validatedGameId);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu introuvable" };
    }

    if (!(await productIdExists(gameObjId, currentId))) {
      return { success: false, error: `Aucun produit « ${currentId} » dans ${game.name}` };
    }

    const checked = await checkContents(gameObjId, currentId, product.contents);
    if (checked.error) {
      return { success: false, error: checked.error };
    }

    // Un produit cité dans le contenu d'un autre ne peut pas devenir contenant
    // à son tour : ce serait un contenant imbriqué par la bande.
    if (checked.contents.length > 0) {
      const containers = await getContainersOf(gameObjId, currentId);
      if (containers.length > 0) {
        return {
          success: false,
          error: `« ${product.name} » figure dans le contenu de ${containers.join(", ")} : il ne peut pas contenir d'autres produits.`,
        };
      }
    }

    await updateProduct(
      gameObjId,
      currentId,
      {
        name: product.name,
        kind: product.kind,
        image: product.image || undefined,
        setCode: product.setCode || undefined,
        contents: checked.contents,
        attributes: product.attributes as Record<string, ProductAttributeValue> | undefined,
      },
      session.user.id
    );

    revalidateProduct(game.slug);
    return { success: true, productId: currentId };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la modification du produit:", error);
    return { success: false, error: "Erreur lors de la modification du produit" };
  }
}

async function getContainersOf(gameObjId: ObjectId, productId: string): Promise<string[]> {
  const containers = await getContainersReferencing(gameObjId, productId);
  return containers.map((container) => `« ${container.name} »`);
}

export async function deleteGameProduct(gameId: string, productId: string): Promise<SaveProductResult> {
  try {
    await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    const gameObjId = new ObjectId(validatedGameId);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu introuvable" };
    }

    const product = await getGameProduct(gameObjId, productId);
    if (!product) {
      return { success: false, error: `Aucun produit « ${productId} » dans ${game.name}` };
    }

    const result = await deleteProduct(gameObjId, productId);
    if (!result.deleted) {
      const { refusal } = result;
      return {
        success: false,
        error:
          refusal.reason === "owned"
            ? `« ${product.name} » est dans la collection de ${refusal.count} exemplaire(s) : il ne peut pas être supprimé.`
            : `« ${product.name} » figure dans le contenu de ${refusal.names.map((name) => `« ${name} »`).join(", ")} : retirez-l'en d'abord.`,
      };
    }

    revalidateProduct(game.slug);
    return { success: true, productId };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la suppression du produit:", error);
    return { success: false, error: "Erreur lors de la suppression du produit" };
  }
}

export async function countProducts(gameId: string): Promise<number> {
  try {
    await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    return await countGameProducts(new ObjectId(validatedGameId));
  } catch {
    return 0;
  }
}

/**
 * Édition en cours d'un jeu : celle que les catalogues montrent par défaut.
 *
 * Elle se règle ici, au-dessus du catalogue qu'elle gouverne, et non dans la
 * fiche du jeu : c'est en voyant combien de produits portent quelle édition —
 * et combien n'en portent aucune — qu'on sait ce qu'on est en train de cacher.
 *
 * La chaîne vide vaut « ce jeu n'a pas d'éditions » et retire le champ. La
 * valeur n'est pas contrainte à celles du catalogue : on peut désigner l'édition
 * à venir avant d'avoir étiqueté le moindre produit.
 */
export async function saveCurrentProductEdition(gameId: string, edition: string): Promise<SaveProductResult> {
  try {
    await requireAdmin();
    const validatedGameId = gameIdSchema.parse(gameId);
    const validated = currentProductEditionSchema.parse(edition);

    const game = await getGameById(validatedGameId);
    if (!game) {
      return { success: false, error: "Jeu introuvable" };
    }

    await setCurrentProductEdition(validatedGameId, validated || null);

    revalidateProduct(game.slug);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de l'enregistrement de l'édition en cours:", error);
    return { success: false, error: "Erreur lors de l'enregistrement de l'édition en cours" };
  }
}
