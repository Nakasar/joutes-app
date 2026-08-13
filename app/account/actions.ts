"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  addGameToUser,
  addFavoriteGameToUser,
  removeFavoriteGameFromUser,
  removeGameFromUser,
  addLairToUser,
  removeLairFromUser,
  updateUserDisplayName,
  getUserDiscriminator,
} from "@/lib/db/users";
import { updateDisplayNameSchema } from "@/lib/schemas/user.schema";
import { generateDiscriminator } from "@/lib/utils";
import db from "@/lib/mongodb";
import {User} from "@/lib/types/User";
import {ObjectId} from "mongodb";
import {
  isNotificationPreference,
  type NotificationChannel,
  type NotificationPreferenceType,
} from "@/lib/notifications/preferences";

export async function addGameToUserList(gameId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await addGameToUser(session.user.id, gameId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de l'ajout du jeu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'ajout du jeu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function removeGameFromUserList(gameId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await removeGameFromUser(session.user.id, gameId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de la suppression du jeu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du jeu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/**
 * Met ou retire un jeu des favoris — ceux que le menu « Jeux » propose.
 *
 * La mise en favori peut échouer sans que rien ne soit cassé : elle est
 * refusée pour un jeu que l'utilisateur ne suit pas (voir
 * `addFavoriteGameToUser`), et l'appelant doit alors défaire son affichage
 * optimiste.
 */
export async function setFavoriteGameAction(
  gameId: string,
  favorite: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = favorite
      ? await addFavoriteGameToUser(session.user.id, gameId)
      : await removeFavoriteGameFromUser(session.user.id, gameId);

    if (!result) {
      return {
        success: false,
        error: favorite
          ? "Ce jeu doit d'abord faire partie de vos jeux suivis"
          : "Erreur lors du retrait du favori",
      };
    }

    revalidatePath("/account");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise en favori du jeu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function addLairToUserList(lairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await addLairToUser(session.user.id, lairId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de l'ajout du lieu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'ajout du lieu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function removeLairFromUserList(lairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const result = await removeLairFromUser(session.user.id, lairId);
    
    if (!result) {
      return { success: false, error: "Erreur lors de la suppression du lieu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du lieu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function updateUserDisplayNameAction(
  displayName: string
): Promise<{ success: boolean; error?: string; fullUsername?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Valider le nom d'utilisateur
    const validationResult = updateDisplayNameSchema.safeParse({ displayName });
    
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Nom d'utilisateur invalide";
      return { success: false, error: errorMessage };
    }

    // Vérifier si l'utilisateur a déjà un discriminateur
    let discriminator = await getUserDiscriminator(session.user.id);
    
    // Si pas de discriminateur, en générer un
    if (!discriminator) {
      discriminator = generateDiscriminator();
    }

    // Mettre à jour le nom d'utilisateur
    const result = await updateUserDisplayName(
      session.user.id,
      validationResult.data.displayName,
      discriminator
    );
    
    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour du nom d'utilisateur" };
    }

    // Invalider le cache de la page compte pour forcer le rafraîchissement
    revalidatePath("/account");

    return {
      success: true,
      fullUsername: `${validationResult.data.displayName}#${discriminator}`,
    };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du nom d'utilisateur:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/** Longueur au-delà de laquelle un nom de localité n'en est plus un. */
const MAX_PLACE_FIELD_LENGTH = 200;

/** Ne garde une chaîne que si elle porte quelque chose, et pas trop. */
function sanitizePlaceField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_PLACE_FIELD_LENGTH);
}

/**
 * `place` accompagne les coordonnées de la localité d'où elles viennent, quand
 * elle a été choisie dans une liste de villes. Le libellé est enregistré tel
 * que l'utilisateur l'a vu : c'est lui qui sera réaffiché, et un « Lyon
 * (69000), France » se relit mieux que « 45.7640, 4.8357 ».
 */
export async function updateUserLocation(
  latitude: number | null,
  longitude: number | null,
  place?: { label?: string; city?: string; postalCode?: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Validation des coordonnées
    if (latitude !== null && longitude !== null) {
      if (isNaN(latitude) || isNaN(longitude)) {
        return { success: false, error: "Coordonnées invalides" };
      }
      if (latitude < -90 || latitude > 90) {
        return { success: false, error: "La latitude doit être comprise entre -90 et 90" };
      }
      if (longitude < -180 || longitude > 180) {
        return { success: false, error: "La longitude doit être comprise entre -180 et 180" };
      }
    }

    const { updateUserLocation: updateLocation } = await import("@/lib/db/users");
    const result = await updateLocation(session.user.id, latitude, longitude, {
      label: sanitizePlaceField(place?.label),
      city: sanitizePlaceField(place?.city),
      postalCode: sanitizePlaceField(place?.postalCode),
    });

    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour de la localisation" };
    }

    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la localisation:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function updateNotificationsPreference(
  type: NotificationPreferenceType,
  channel: NotificationChannel,
  enable: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const user = await db.collection<User>('user').findOne({
      _id: new ObjectId(session.user.id),
    }, { projection: { _id: 1, notifications: 1 }});

    if (!user) {
      return { success: false, error: "Non authentifié" };
    }

    // Le contrôle portait sur le canal et le type séparément, ce qui laissait
    // passer des couples qui n'existent nulle part — un « courriel push », un
    // « récapitulatif plateforme ». La matrice les nomme un par un.
    if (!isNotificationPreference(channel, type)) {
      return { success: false, error: "Réglage de notification inconnu." };
    }

    await db.collection<User>('user').updateOne({
      _id: new ObjectId(session.user.id),
    }, {
      $set: {
        [`notifications.${channel}.${type}.enabled`]: enable,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la MàJ des préférences de notification :", error);
    return { success: false, error: "Erreur serveur" };
  }
}