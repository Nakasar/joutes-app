import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import {
  generateUniqueDiscriminator,
  getUserByUsernameAndDiscriminator,
  getUserDiscriminator,
  updateUserDisplayName,
  updateUserLocation,
  updateUserProfileImage,
} from "@/lib/db/users";
import { findDiscordAccountId } from "@/lib/db/discord-notifications";
import { disableDiscordDm, discordOptInErrorMessage, enableDiscordDm } from "@/lib/notifications/discord-optin";
import { isNotificationPreference } from "@/lib/notifications/preferences";
import { readNotificationSettings, type NotificationSetting } from "@/lib/notifications/settings-view";
import { updateDisplayNameSchema } from "@/lib/schemas/user.schema";
import { displayAvatar } from "@/lib/users/document";
import type { User } from "@/lib/types/User";

/**
 * Le profil d'un compte, partagé par les actions de `/account` et par la route
 * `/api/users/me/profile` de l'app mobile : pseudo, avatar, localité et
 * préférences de notification. Une seule écriture, deux portes.
 */

export type ProfileResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Change le pseudo, en gardant le discriminateur du compte quand il est libre. */
export async function setProfileDisplayName(
  userId: string,
  displayName: string,
): Promise<ProfileResult<{ fullUsername: string }>> {
  const validation = updateDisplayNameSchema.safeParse({ displayName });
  if (!validation.success) {
    return { ok: false, error: validation.error.issues[0]?.message || "Nom d'utilisateur invalide" };
  }

  // Le discriminateur du compte est gardé, sauf s'il n'en a pas ou si un
  // autre compte porte déjà ce pseudonyme avec ce nombre : deux comptes ne
  // partagent jamais un tag.
  let discriminator = await getUserDiscriminator(userId);
  const holder = discriminator
    ? await getUserByUsernameAndDiscriminator(validation.data.displayName, discriminator)
    : null;
  if (!discriminator || (holder && holder.id !== userId)) {
    discriminator = await generateUniqueDiscriminator(
      validation.data.displayName,
      ObjectId.createFromHexString(userId),
    );
  }

  const updated = await updateUserDisplayName(userId, validation.data.displayName, discriminator);
  if (!updated) {
    return { ok: false, error: "Erreur lors de la mise à jour du nom d'utilisateur" };
  }
  return { ok: true, fullUsername: `${validation.data.displayName}#${discriminator}` };
}

/** Longueur au-delà de laquelle un nom de localité n'en est plus un. */
const MAX_PLACE_FIELD_LENGTH = 200;

/** Ne garde une chaîne que si elle porte quelque chose, et pas trop. */
function sanitizePlaceField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_PLACE_FIELD_LENGTH);
}

export type ProfilePlace = { label?: string; city?: string; postalCode?: string };

/**
 * Pose (ou retire, avec deux `null`) la localité du compte. `place` est le
 * libellé de la ville choisie, réaffiché tel que l'utilisateur l'a vu.
 */
export async function setProfileLocation(
  userId: string,
  latitude: number | null,
  longitude: number | null,
  place?: ProfilePlace | null,
): Promise<ProfileResult> {
  if (latitude !== null && longitude !== null) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: "Coordonnées invalides" };
    }
    if (latitude < -90 || latitude > 90) {
      return { ok: false, error: "La latitude doit être comprise entre -90 et 90" };
    }
    if (longitude < -180 || longitude > 180) {
      return { ok: false, error: "La longitude doit être comprise entre -180 et 180" };
    }
  }

  const updated = await updateUserLocation(userId, latitude, longitude, {
    label: sanitizePlaceField(place?.label),
    city: sanitizePlaceField(place?.city),
    postalCode: sanitizePlaceField(place?.postalCode),
  });
  return updated ? { ok: true } : { ok: false, error: "Erreur lors de la mise à jour de la localisation" };
}

/** Ouvre ou coupe une notification, pour un couple canal/type qui existe. */
export async function setNotificationPreference(
  userId: string,
  channel: string,
  type: string,
  enable: boolean,
): Promise<ProfileResult> {
  // Le contrôle portait sur le canal et le type séparément, ce qui laissait
  // passer des couples qui n'existent nulle part — un « courriel push », un
  // « récapitulatif plateforme ». La matrice les nomme un par un.
  if (!isNotificationPreference(channel, type)) {
    return { ok: false, error: "Réglage de notification inconnu." };
  }

  // Les messages privés Discord ont leur propre chemin : l'activation vérifie
  // la liaison du compte et que le bot peut vraiment écrire au joueur.
  if (channel === "discord") {
    if (!enable) {
      await disableDiscordDm(userId);
      return { ok: true };
    }
    const result = await enableDiscordDm(userId);
    return result.ok ? { ok: true } : { ok: false, error: discordOptInErrorMessage(result.reason) };
  }

  await db.collection<User>("user").updateOne(
    { _id: new ObjectId(userId) },
    { $set: { [`notifications.${channel}.${type}.enabled`]: enable } },
  );
  return { ok: true };
}

export type ProfileView = {
  displayName?: string;
  discriminator?: string;
  /** L'image affichée partout (`displayAvatar`). */
  avatar?: string;
  /** L'image déposée par le joueur, s'il en a une. */
  profileImage?: string;
  location?: { latitude: number; longitude: number; label?: string; city?: string; postalCode?: string };
  notifications: NotificationSetting[];
};

/** Le profil modifiable du compte, pour l'app. */
export async function readProfile(userId: string): Promise<ProfileView | null> {
  const [document, discordAccountId] = await Promise.all([
    db.collection<User>("user").findOne(
      { _id: new ObjectId(userId) },
      {
        projection: {
          _id: 1,
          displayName: 1,
          username: 1,
          discriminator: 1,
          profileImage: 1,
          image: 1,
          avatar: 1,
          location: 1,
          notifications: 1,
        },
      },
    ),
    findDiscordAccountId(userId),
  ]);
  if (!document) return null;
  const raw = document as unknown as Record<string, unknown>;
  const location = raw.location as
    | { latitude?: number; longitude?: number; label?: string; city?: string; postalCode?: string }
    | undefined;

  return {
    displayName: (raw.displayName as string | undefined) ?? (raw.username as string | undefined),
    discriminator: raw.discriminator as string | undefined,
    avatar: displayAvatar(raw) ?? undefined,
    profileImage: (raw.profileImage as string | undefined) || undefined,
    ...(typeof location?.latitude === "number" && typeof location?.longitude === "number"
      ? {
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            ...(location.label ? { label: location.label } : {}),
            ...(location.city ? { city: location.city } : {}),
            ...(location.postalCode ? { postalCode: location.postalCode } : {}),
          },
        }
      : {}),
    notifications: readNotificationSettings(document.notifications, Boolean(discordAccountId)),
  };
}

/** Pose l'image de profil (une adresse déposée par `/api/users/me/upload`), ou la retire. */
export async function setProfileImage(userId: string, url: string): Promise<ProfileResult> {
  const ok = await updateUserProfileImage(userId, url);
  return ok ? { ok: true } : { ok: false, error: "Erreur lors de la mise à jour de l'avatar" };
}
