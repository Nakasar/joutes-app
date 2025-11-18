"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { checkAdminOrOwner } from "@/lib/middleware/admin";
import { revalidatePath } from "next/cache";
import { createEvent as createEventDb } from "@/lib/db/events";
import { getLairById } from "@/lib/db/lairs";
import { Event } from "@/lib/types/Event";
import { DateTime } from "luxon";
import { z } from "zod";

const createEventSchema = z.object({
  name: z.string().min(1, "Le nom de l'événement est requis").max(500, "Le nom est trop long"),
  startDateTime: z.string().min(1, "La date de début est requise"),
  endDateTime: z.string().min(1, "La date de fin est requise"),
  gameName: z.string().min(1, "Le nom du jeu est requis").max(200, "Le nom du jeu est trop long"),
  url: z.string().url("L'URL doit être valide").optional().or(z.literal("")),
  price: z.number().min(0, "Le prix doit être positif").optional(),
  status: z.enum(['available', 'sold-out', 'cancelled']),
}).refine(
  (data) => {
    const start = new Date(data.startDateTime);
    const end = new Date(data.endDateTime);
    return end > start;
  },
  {
    message: "La date de fin doit être après la date de début",
    path: ["endDateTime"],
  }
);

export async function createEventAction(
  lairId: string,
  data: {
    name: string;
    startDateTime: string;
    endDateTime: string;
    gameName: string;
    url?: string;
    price?: number;
    status: 'available' | 'sold-out' | 'cancelled';
  }
) {
  try {
    // Vérifier l'authentification
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est admin ou owner du lair
    const canManage = await checkAdminOrOwner(lairId);
    if (!canManage) {
      return { success: false, error: "Non autorisé" };
    }

    // Vérifier que le lair existe
    const lair = await getLairById(lairId);
    if (!lair) {
      return { success: false, error: "Lieu non trouvé" };
    }

    // Valider les données
    const validatedData = createEventSchema.parse(data);

    // Convertir les dates en format ISO 8601
    const startDateTime = DateTime.fromISO(validatedData.startDateTime, { zone: 'Europe/Paris' }).toISO();
    const endDateTime = DateTime.fromISO(validatedData.endDateTime, { zone: 'Europe/Paris' }).toISO();

    if (!startDateTime || !endDateTime) {
      return { success: false, error: "Format de date invalide" };
    }

    // Créer l'événement
    const newEvent: Event = {
      id: crypto.randomUUID(),
      lairId,
      name: validatedData.name,
      startDateTime,
      endDateTime,
      gameName: validatedData.gameName,
      url: validatedData.url && validatedData.url.length > 0 ? validatedData.url : undefined,
      price: validatedData.price,
      status: validatedData.status,
      addedBy: "USER",
      creatorId: session.user.id,
    };

    await createEventDb(newEvent);

    revalidatePath(`/lairs/${lairId}`);
    revalidatePath("/events");

    return { success: true, event: newEvent };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "Données invalides",
      };
    }
    console.error("Erreur lors de la création de l'événement:", error);
    return { success: false, error: "Erreur lors de la création de l'événement" };
  }
}
