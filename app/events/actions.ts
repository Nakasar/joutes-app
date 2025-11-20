"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createEvent, getEventById, addParticipantToEvent, removeParticipantFromEvent, addEventToFavorites, removeEventFromFavorites } from "@/lib/db/events";
import { getLairsOwnedByUser } from "@/lib/db/lairs";
import { getUserByTagOrId } from "@/lib/db/users";
import { nanoid } from 'nanoid';
import { Event } from "@/lib/types/Event";
import { revalidatePath } from "next/cache";

type CreateEventInput = {
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  lairId?: string;
  url?: string;
  price?: number;
  maxParticipants?: number;
};

export async function createEventAction(input: CreateEventInput) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour créer un événement" };
    }

    // Si un lairId est fourni, vérifier que l'utilisateur en est propriétaire
    if (input.lairId) {
      const ownedLairs = await getLairsOwnedByUser(session.user.id);
      const ownsLair = ownedLairs.some(lair => lair.id === input.lairId);
      
      if (!ownsLair) {
        return { success: false, error: "Vous n'êtes pas propriétaire de ce lieu" };
      }
    }

    // Valider les dates
    const startDate = new Date(input.startDateTime);
    const endDate = new Date(input.endDateTime);
    
    if (startDate >= endDate) {
      return { success: false, error: "La date de fin doit être après la date de début" };
    }

    // Créer l'événement
    const event: Event = {
      id: nanoid(12),
      name: input.name,
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime,
      gameName: input.gameName,
      lairId: input.lairId,
      url: input.url,
      price: input.price,
      status: "available",
      addedBy: "USER",
      creatorId: session.user.id,
      allowJoin: true,
      participants: [],
      maxParticipants: input.maxParticipants,
    };

    await createEvent(event);

    revalidatePath("/events");
    revalidatePath("/account");

    return { success: true, eventId: event.id };
  } catch (error) {
    console.error("Erreur lors de la création de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de la création de l'événement" };
  }
}

export async function joinEventAction(eventId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour rejoindre un événement" };
    }

    // Récupérer l'événement
    const event = await getEventById(eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    if (!event.allowJoin) {
      return { success: false, error: "Les inscriptions à cet événement sont fermées" };
    }

    // Vérifier si l'événement est complet
    if (event.maxParticipants && event.participants && event.participants.length >= event.maxParticipants) {
      return { success: false, error: "Cet événement est complet" };
    }

    // Vérifier si l'utilisateur est déjà inscrit
    if (event.participants?.includes(session.user.id)) {
      return { success: false, error: "Vous êtes déjà inscrit à cet événement" };
    }

    // Ajouter le participant
    const added = await addParticipantToEvent(eventId, session.user.id);

    if (!added) {
      return { success: false, error: "Impossible de s'inscrire à l'événement" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'inscription à l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de l'inscription" };
  }
}

export async function leaveEventAction(eventId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour quitter un événement" };
    }

    // Retirer le participant
    const removed = await removeParticipantFromEvent(eventId, session.user.id);

    if (!removed) {
      return { success: false, error: "Impossible de quitter l'événement" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la désinscription de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de la désinscription" };
  }
}

export async function removeParticipantAction(eventId: string, userId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté" };
    }

    // Récupérer l'événement
    const event = await getEventById(eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    // Vérifier que l'utilisateur connecté est le créateur de l'événement
    if (event.creatorId !== session.user.id) {
      return { success: false, error: "Seul le créateur de l'événement peut retirer des participants" };
    }

    // Retirer le participant
    const removed = await removeParticipantFromEvent(eventId, userId);

    if (!removed) {
      return { success: false, error: "Impossible de retirer ce participant" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du retrait du participant:", error);
    return { success: false, error: "Une erreur est survenue lors du retrait du participant" };
  }
}

export async function addParticipantByTagAction(eventId: string, userTag: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté" };
    }

    // Récupérer l'événement
    const event = await getEventById(eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    // Vérifier que l'utilisateur connecté est le créateur de l'événement
    if (event.creatorId !== session.user.id) {
      return { success: false, error: "Seul le créateur de l'événement peut ajouter des participants" };
    }

    // Rechercher l'utilisateur par son tag
    const user = await getUserByTagOrId(userTag);

    if (!user) {
      return { success: false, error: "Utilisateur introuvable" };
    }

    // Vérifier si l'événement est complet
    if (event.maxParticipants && event.participants && event.participants.length >= event.maxParticipants) {
      return { success: false, error: "Cet événement est complet" };
    }

    // Vérifier si l'utilisateur est déjà inscrit
    if (event.participants?.includes(user.id)) {
      return { success: false, error: "Cet utilisateur est déjà inscrit à l'événement" };
    }

    // Ajouter le participant
    const added = await addParticipantToEvent(eventId, user.id);

    if (!added) {
      return { success: false, error: "Impossible d'ajouter ce participant" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true, userName: user.displayName || user.username };
  } catch (error) {
    console.error("Erreur lors de l'ajout du participant:", error);
    return { success: false, error: "Une erreur est survenue lors de l'ajout du participant" };
  }
}

export async function toggleEventFavoriteAction(eventId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté pour mettre un événement en favori" };
    }

    // Récupérer l'événement
    const event = await getEventById(eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    // Vérifier si l'événement est déjà en favori
    console.log(event);
    const isFavorited = event.favoritedBy?.includes(session.user.id);

    let result: boolean;
    console.log(isFavorited);
    if (isFavorited) {
      // Retirer des favoris
      result = await removeEventFromFavorites(eventId, session.user.id);
    } else {
      // Ajouter aux favoris
      result = await addEventToFavorites(eventId, session.user.id);
    }

    if (!result) {
      return { success: false, error: "Impossible de modifier les favoris" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath("/account");

    return { success: true, isFavorited: !isFavorited };
  } catch (error) {
    console.error("Erreur lors de la modification des favoris:", error);
    return { success: false, error: "Une erreur est survenue lors de la modification des favoris" };
  }
}
