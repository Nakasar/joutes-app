import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isAppBlobImageUrl } from "@/lib/media/blob-image-url";
import {
  readProfile,
  setNotificationPreference,
  setProfileDisplayName,
  setProfileImage,
  setProfileLocation,
} from "@/lib/users/profile-service";

/**
 * Le profil du compte connecté, pour l'app mobile : ce que `/account` règle
 * en pseudo, avatar, localité et notifications. Les écritures passent par les
 * mêmes fonctions que les actions du site (`lib/users/profile-service.ts`).
 *
 * La vitrine, la préférence de prix, les intégrations et l'abonnement restent
 * sur le site.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    const profile = await readProfile(session.user.id);
    if (!profile) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Erreur lors de la lecture du profil:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const patchSchema = z
  .strictObject({
    displayName: z.string().optional(),
    /** Une adresse déposée par `POST /api/users/me/upload`, ou "" pour retirer l'image. */
    profileImage: z
      .string()
      .max(2000)
      .refine((value) => value === "" || isAppBlobImageUrl(value), {
        message: "L'image doit avoir été téléversée sur Joutes",
      })
      .optional(),
    /** `null` retire la localité. */
    location: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        label: z.string().optional(),
        city: z.string().optional(),
        postalCode: z.string().optional(),
      })
      .nullable()
      .optional(),
    notification: z
      .object({ channel: z.string(), type: z.string(), enabled: z.boolean() })
      .optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Rien à enregistrer",
  });

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Données invalides" },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Un champ après l'autre : le premier refus arrête la requête et dit
    // lequel. Chaque écriture est indépendante et sans effet sur les autres.
    const steps: (() => Promise<{ ok: true } | { ok: false; error: string }>)[] = [];
    if (input.displayName !== undefined) {
      steps.push(() => setProfileDisplayName(userId, input.displayName!));
    }
    if (input.profileImage !== undefined) {
      steps.push(() => setProfileImage(userId, input.profileImage!));
    }
    if (input.location !== undefined) {
      const location = input.location;
      steps.push(() =>
        location
          ? setProfileLocation(userId, location.latitude, location.longitude, location)
          : setProfileLocation(userId, null, null, null),
      );
    }
    if (input.notification) {
      const { channel, type, enabled } = input.notification;
      steps.push(() => setNotificationPreference(userId, channel, type, enabled));
    }

    for (const step of steps) {
      const result = await step();
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    revalidatePath("/account");
    const profile = await readProfile(userId);
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du profil:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
