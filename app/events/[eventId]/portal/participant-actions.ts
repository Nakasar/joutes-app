"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import {
  addParticipantSchema,
  guestParticipantSchema,
  GuestParticipant,
  AddParticipant,
} from "@/lib/schemas/event-portal.schema";
import { getEventById } from "@/lib/db/events";
import { getUserByUsernameAndDiscriminator, getUserByEmail } from "@/lib/db/users";
import crypto from "crypto";

const GUEST_PARTICIPANTS_COLLECTION = "event-guest-participants";
const EVENTS_COLLECTION = "events";
const USERS_COLLECTION = "user";

// Vérifier si l'utilisateur est le créateur de l'événement
async function isEventCreator(eventId: string, userId: string): Promise<boolean> {
  const event = await getEventById(eventId);
  return event?.creatorId === userId;
}

// Générer un discriminant unique pour un username
async function generateUniqueDiscriminator(username: string): Promise<string> {
  const collection = db.collection(USERS_COLLECTION);
  
  // Essayer 10 fois de trouver un discriminant unique
  for (let i = 0; i < 10; i++) {
    const discriminator = Math.floor(1000 + Math.random() * 9000).toString();
    
    const existing = await collection.findOne({
      displayName: username,
      discriminator,
    });
    
    if (!existing) {
      return discriminator;
    }
  }
  
  // Si on n'a pas trouvé après 10 essais, générer un nombre aléatoire plus grand
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// =====================
// GESTION DES PARTICIPANTS
// =====================

export async function addParticipantToEvent(eventId: string, data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = addParticipantSchema.parse(data);

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l'événement peut ajouter des participants" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement non trouvé" };
    }

    // Vérifier le nombre maximum de participants
    if (event.maxParticipants && (event.participants?.length || 0) >= event.maxParticipants) {
      return { success: false, error: "L'événement est complet" };
    }

    const eventsCollection = db.collection(EVENTS_COLLECTION);
    const guestsCollection = db.collection<GuestParticipant>(GUEST_PARTICIPANTS_COLLECTION);

    // Traiter selon le type de participant
    if (validated.type === "userTag") {
      // Format: username#1234
      const parts = validated.userTag.split("#");
      if (parts.length !== 2) {
        return { success: false, error: "Format invalide. Utilisez le format username#1234" };
      }

      const [displayName, discriminator] = parts;
      const user = await getUserByUsernameAndDiscriminator(displayName, discriminator);

      if (!user) {
        return { success: false, error: "Utilisateur non trouvé" };
      }

      // Vérifier si l'utilisateur est déjà participant
      if (event.participants?.includes(user.id)) {
        return { success: false, error: "Cet utilisateur est déjà participant" };
      }

      // Ajouter l'utilisateur aux participants
      await eventsCollection.updateOne(
        { id: eventId },
        { $addToSet: { participants: user.id } }
      );

      return {
        success: true,
        participant: {
          id: user.id,
          username: user.displayName || user.username,
          discriminator: user.discriminator,
          type: "user",
        },
      };
    } else if (validated.type === "email") {
      // Vérifier si un utilisateur existe déjà avec cet email
      const existingUser = await getUserByEmail(validated.email);
      
      if (existingUser) {
        // Ajouter l'utilisateur existant
        if (event.participants?.includes(existingUser.id)) {
          return { success: false, error: "Cet utilisateur est déjà participant" };
        }

        await eventsCollection.updateOne(
          { id: eventId },
          { $addToSet: { participants: existingUser.id } }
        );

        return {
          success: true,
          participant: {
            id: existingUser.id,
            username: existingUser.displayName || existingUser.username,
            discriminator: existingUser.discriminator,
            type: "user",
          },
        };
      }

      // Créer un nouveau compte utilisateur
      const discriminator = await generateUniqueDiscriminator(validated.username);
      const usersCollection = db.collection(USERS_COLLECTION);
      
      const newUser = {
        username: validated.username,
        displayName: validated.username,
        discriminator,
        email: validated.email.toLowerCase(),
        discordId: "",
        avatar: "",
        lairs: [],
        games: [],
        isPublicProfile: false,
        createdAt: new Date().toISOString(),
        createdVia: "event-invite", // Marquer que ce compte a été créé via une invitation
      };

      const result = await usersCollection.insertOne(newUser as any);
      const userId = result.insertedId.toString();

      // Créer un participant invité
      const guestParticipant: GuestParticipant = {
        id: new ObjectId().toString(),
        eventId,
        type: "email",
        username: validated.username,
        discriminator,
        email: validated.email,
        userId,
        addedBy: session.user.id,
        addedAt: new Date().toISOString(),
      };

      await guestsCollection.insertOne(guestParticipant as GuestParticipant & { _id?: ObjectId });

      // Ajouter l'utilisateur aux participants
      await eventsCollection.updateOne(
        { id: eventId },
        { $addToSet: { participants: userId } }
      );

      return {
        success: true,
        participant: {
          id: userId,
          username: validated.username,
          discriminator,
          email: validated.email,
          type: "email",
          newAccount: true,
        },
      };
    } else if (validated.type === "guest") {
      // Créer un participant invité sans compte
      const guestId = new ObjectId().toString();
      
      const guestParticipant: GuestParticipant = {
        id: guestId,
        eventId,
        type: "guest",
        username: validated.username,
        addedBy: session.user.id,
        addedAt: new Date().toISOString(),
      };

      await guestsCollection.insertOne(guestParticipant as GuestParticipant & { _id?: ObjectId });

      return {
        success: true,
        participant: {
          id: guestId,
          username: validated.username,
          type: "guest",
        },
      };
    }

    return { success: false, error: "Type de participant invalide" };
  } catch (error) {
    console.error("Erreur lors de l'ajout du participant:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de l'ajout du participant" };
  }
}

export async function removeParticipantFromEvent(eventId: string, participantId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l'événement peut retirer des participants" };
    }

    const eventsCollection = db.collection(EVENTS_COLLECTION);
    const guestsCollection = db.collection<GuestParticipant>(GUEST_PARTICIPANTS_COLLECTION);

    // Vérifier si c'est un participant invité
    const guestParticipant = await guestsCollection.findOne({
      id: participantId,
      eventId,
    });

    if (guestParticipant) {
      // Supprimer le participant invité
      await guestsCollection.deleteOne({ id: participantId, eventId });

      // Si c'était un participant avec userId, le retirer aussi des participants de l'événement
      if (guestParticipant.userId) {
        await eventsCollection.updateOne(
          { id: eventId },
          { $pull: { participants: guestParticipant.userId } as any }
        );
      }
    } else {
      // Retirer l'utilisateur des participants
      await eventsCollection.updateOne(
        { id: eventId },
        { $pull: { participants: participantId } as any }
      );
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du participant:", error);
    return { success: false, error: "Erreur lors de la suppression du participant" };
  }
}

export async function getEventParticipants(eventId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement non trouvé" };
    }

    // Vérifier l'accès
    const isCreator = event.creatorId === session.user.id;
    const isParticipant = event.participants?.includes(session.user.id);
    
    if (!isCreator && !isParticipant) {
      return { success: false, error: "Accès non autorisé" };
    }

    const guestsCollection = db.collection<GuestParticipant>(GUEST_PARTICIPANTS_COLLECTION);
    
    // Récupérer les participants invités
    const guestParticipants = await guestsCollection.find({ eventId }).toArray();

    // Récupérer les utilisateurs participants
    const usersCollection = db.collection(USERS_COLLECTION);
    const userParticipants = event.participants
      ? await usersCollection.find({
          _id: { $in: event.participants.map(id => ObjectId.createFromHexString(id)) }
        }).toArray()
      : [];

    // Combiner les participants
    const participants = [
      ...userParticipants.map(user => ({
        id: user._id.toString(),
        username: user.displayName || user.username,
        discriminator: user.discriminator,
        email: user.email,
        profileImage: user.profileImage,
        type: "user" as const,
      })),
      ...guestParticipants.map(guest => ({
        id: guest.id,
        username: guest.username,
        discriminator: guest.discriminator,
        email: guest.email,
        type: guest.type,
      })),
    ];

    return {
      success: true,
      data: participants,
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des participants:", error);
    return { success: false, error: "Erreur lors de la récupération des participants" };
  }
}

export async function getGuestParticipants(eventId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur peut voir les participants invités" };
    }

    const guestsCollection = db.collection<GuestParticipant>(GUEST_PARTICIPANTS_COLLECTION);
    const guestParticipants = await guestsCollection.find({ eventId }).toArray();

    return {
      success: true,
      data: guestParticipants.map(guest => ({
        ...guest,
        id: guest._id?.toString() || guest.id,
        _id: undefined,
      })),
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des participants invités:", error);
    return { success: false, error: "Erreur lors de la récupération des participants invités" };
  }
}
