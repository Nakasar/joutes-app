"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createEvent, getEventById, addParticipantToEvent, removeParticipantFromEvent, addEventToFavorites, removeEventFromFavorites, deleteEvent, updateEvent, updateParticipantRegistrationStatus } from "@/lib/db/events";
import { getLairsOwnedByUser } from "@/lib/db/lairs";
import { getUserByTagOrId } from "@/lib/db/users";
import { nanoid } from 'nanoid';
import { Event, RegistrationStatus } from "@/lib/types/Event";
import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { notifyEventAll } from "@/lib/services/notifications";
import { isUserOrganizer } from "@/lib/utils/permissions";

type CreateEventInput = {
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  lairId?: string;
  url?: string;
  price?: number;
  maxParticipants?: number;
  preRegistration?: boolean;
};

type UpdateEventDetailsInput = {
  eventId: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
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
      runningState: "not-started",
      allowJoin: true,
      participants: [],
      participantRegistrations: {},
      preRegistration: input.preRegistration || false,
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

export async function updateEventDetailsAction(input: UpdateEventDetailsInput) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté" };
    }

    const event = await getEventById(input.eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent modifier ces informations" };
    }

    const startDate = DateTime.fromISO(input.startDateTime);
    const endDate = DateTime.fromISO(input.endDateTime);

    if (!startDate.isValid || !endDate.isValid) {
      return { success: false, error: "Les dates saisies ne sont pas valides" };
    }

    if (startDate >= endDate) {
      return { success: false, error: "La date de fin doit être après la date de début" };
    }

    if (input.price !== undefined && input.price < 0) {
      return { success: false, error: "Le prix doit être supérieur ou égal à 0" };
    }

    if (input.maxParticipants !== undefined && input.maxParticipants < 1) {
      return { success: false, error: "Le nombre de participants doit être supérieur ou égal à 1" };
    }

    if (
      input.maxParticipants !== undefined
      && (event.registeredParticipantsCount ?? 0) > input.maxParticipants
    ) {
      return {
        success: false,
        error: "Le nombre max ne peut pas être inférieur au nombre de participants déjà inscrits",
      };
    }

    const updated = await updateEvent(input.eventId, {
      name: input.name,
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime,
      gameName: input.gameName,
      url: input.url,
      price: input.price,
      maxParticipants: input.maxParticipants,
    });

    revalidatePath(`/events/${input.eventId}`);
    revalidatePath(`/events/${input.eventId}/portal/organizer`);
    revalidatePath("/events");
    revalidatePath("/account");

    if (!updated) {
      return { success: true, unchanged: true };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de la mise à jour" };
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

    // Vérifier si l'événement est commencé ou terminé
    if (event.runningState && event.runningState !== 'not-started') {
      return { success: false, error: "Impossible de rejoindre un événement déjà commencé ou terminé" };
    }

    // Vérifier si l'événement est complet (ne compter que les REGISTERED)
    if (event.maxParticipants && (event.registeredParticipantsCount ?? 0) >= event.maxParticipants) {
      return { success: false, error: "Cet événement est complet" };
    }

    // Vérifier si l'utilisateur est déjà inscrit
    if (event.participants?.includes(session.user.id)) {
      return { success: false, error: "Vous êtes déjà inscrit à cet événement" };
    }

    // Déterminer le statut d'inscription
    const registrationStatus: RegistrationStatus = event.preRegistration ? 'PRE_REGISTERED' : 'REGISTERED';

    // Ajouter le participant
    const added = await addParticipantToEvent(eventId, session.user.id, registrationStatus);

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

    // Vérifier que l'utilisateur connecté est un organisateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent retirer des participants" };
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

    // Vérifier que l'utilisateur connecté est un organisateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent ajouter des participants" };
    }

    // Vérifier si l'événement est commencé ou terminé
    if (event.runningState && event.runningState !== 'not-started') {
      return { success: false, error: "Impossible d'ajouter des participants à un événement déjà commencé ou terminé" };
    }

    // Rechercher l'utilisateur par son tag
    const user = await getUserByTagOrId(userTag);

    if (!user) {
      return { success: false, error: "Utilisateur introuvable" };
    }

    // Vérifier si l'événement est complet (ne compter que les REGISTERED)
    if (event.maxParticipants && (event.registeredParticipantsCount ?? 0) >= event.maxParticipants) {
      return { success: false, error: "Cet événement est complet" };
    }

    // Vérifier si l'utilisateur est déjà inscrit
    if (event.participants?.includes(user.id)) {
      return { success: false, error: "Cet utilisateur est déjà inscrit à l'événement" };
    }

    // Déterminer le statut d'inscription (le créateur ajoute directement en REGISTERED)
    const registrationStatus: RegistrationStatus = 'REGISTERED';

    // Ajouter le participant
    const added = await addParticipantToEvent(eventId, user.id, registrationStatus);

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
    const isFavorited = event.favoritedBy?.includes(session.user.id);

    let result: boolean;
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

export async function toggleAllowJoinAction(eventId: string, allowJoin: boolean) {
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

    // Vérifier que l'utilisateur est un organisateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent modifier ce paramètre" };
    }

    // Mettre à jour allowJoin

    const updated = await updateEvent(eventId, { allowJoin });

    if (!updated) {
      return { success: false, error: "Impossible de mettre à jour l'événement" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la modification de allowJoin:", error);
    return { success: false, error: "Une erreur est survenue lors de la modification" };
  }
}

export async function startEventAction(eventId: string) {
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

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent démarrer l'événement" };
    }

    // Vérifier que l'événement n'est pas déjà commencé ou terminé
    if (event.runningState === 'ongoing') {
      return { success: false, error: "L'événement est déjà en cours" };
    }

    if (event.runningState === 'completed') {
      return { success: false, error: "L'événement est déjà terminé" };
    }

    // Mettre à jour le runningState
    const updated = await updateEvent(eventId, { runningState: 'ongoing' });

    if (!updated) {
      return { success: false, error: "Impossible de démarrer l'événement" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du démarrage de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors du démarrage de l'événement" };
  }
}

export async function completeEventAction(eventId: string) {
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

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent terminer l'événement" };
    }

    // Vérifier que l'événement n'est pas déjà terminé
    if (event.runningState === 'completed') {
      return { success: false, error: "L'événement est déjà terminé" };
    }

    // Mettre à jour le runningState
    const updated = await updateEvent(eventId, { runningState: 'completed' });

    if (!updated) {
      return { success: false, error: "Impossible de terminer l'événement" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la terminaison de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de la terminaison de l'événement" };
  }
}

export async function cancelEventAction(eventId: string, reason?: string) {
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

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent annuler l'événement" };
    }

    // Vérifier que l'événement n'est pas déjà annulé ou terminé
    if (event.status === 'cancelled') {
      return { success: false, error: "L'événement est déjà annulé" };
    }

    if (event.runningState === 'completed') {
      return { success: false, error: "Impossible d'annuler un événement terminé" };
    }

    // Mettre à jour le statut
    const updated = await updateEvent(eventId, { status: 'cancelled' });

    if (!updated) {
      return { success: false, error: "Impossible d'annuler l'événement" };
    }

    // Envoyer une notification à tous les participants et au créateur
    try {
      const notificationMessage = reason 
        ? `L'événement "${event.name}" a été annulé. Raison : ${reason}`
        : `L'événement "${event.name}" a été annulé.`;
      
      await notifyEventAll(
        eventId,
        "🚫 Événement annulé",
        notificationMessage
      );
    } catch (notifError) {
      console.error("Erreur lors de l'envoi de la notification:", notifError);
      // On ne fait pas échouer l'annulation si la notification échoue
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath("/account");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'annulation de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de l'annulation de l'événement" };
  }
}

export async function deleteEventAction(eventId: string) {
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

    // Vérifier que l'utilisateur est le créateur de l'événement
    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent supprimer l'événement" };
    }

    // Envoyer une notification à tous les participants et au créateur AVANT de supprimer
    try {
      await notifyEventAll(
        eventId,
        "🗑️ Événement supprimé",
        `L'événement "${event.name}" a été supprimé.`
      );
    } catch (notifError) {
      console.error("Erreur lors de l'envoi de la notification:", notifError);
      // On continue quand même la suppression même si la notification échoue
    }

    // Supprimer l'événement et toutes les données associées
    const deleted = await deleteEvent(eventId);

    if (!deleted) {
      return { success: false, error: "Impossible de supprimer l'événement" };
    }

    revalidatePath("/events");
    revalidatePath("/account");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression de l'événement:", error);
    return { success: false, error: "Une erreur est survenue lors de la suppression de l'événement" };
  }
}

export async function updateParticipantRegistrationStatusAction(
  eventId: string,
  userId: string,
  status: RegistrationStatus
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté" };
    }

    const event = await getEventById(eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent modifier le statut d'inscription" };
    }

    // Vérifier que l'utilisateur est bien participant
    if (!event.participants?.includes(userId)) {
      return { success: false, error: "Cet utilisateur n'est pas participant à l'événement" };
    }

    // Si on passe à REGISTERED, vérifier que le max n'est pas atteint
    if (status === 'REGISTERED' && event.maxParticipants) {
      const registeredCount = event.registeredParticipantsCount ?? 0;
      const currentStatus = event.participantRegistrations?.[userId];
      // Ne vérifier que si le participant n'est pas déjà REGISTERED
      if (currentStatus !== 'REGISTERED' && registeredCount >= event.maxParticipants) {
        return { success: false, error: "Le nombre maximum de participants inscrits est atteint" };
      }
    }

    const updated = await updateParticipantRegistrationStatus(eventId, userId, status);

    if (!updated) {
      return { success: false, error: "Impossible de modifier le statut d'inscription" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la modification du statut d'inscription:", error);
    return { success: false, error: "Une erreur est survenue lors de la modification du statut" };
  }
}

export async function togglePreRegistrationAction(eventId: string, preRegistration: boolean) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Vous devez être connecté" };
    }

    const event = await getEventById(eventId);

    if (!event) {
      return { success: false, error: "Événement introuvable" };
    }

    if (!isUserOrganizer(event, session.user.id)) {
      return { success: false, error: "Seuls les organisateurs de l'événement peuvent modifier la pré-inscription" };
    }

    const updated = await updateEvent(eventId, { preRegistration });

    if (!updated) {
      return { success: false, error: "Impossible de mettre à jour l'événement" };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la modification de la pré-inscription:", error);
    return { success: false, error: "Une erreur est survenue lors de la modification" };
  }
}
