import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { readBlobFilename } from "@/lib/media/blob-filename";

/**
 * Le dépôt de la bannière d'un événement.
 *
 * La bannière se choisit aussi **à la création**, quand l'événement n'existe
 * pas encore : le droit se vérifie donc sur la session, comme pour l'avatar
 * d'un compte, et la clé est rangée sous le compte qui dépose. L'adresse rendue
 * n'est inscrite sur l'événement que par `createEventAction` ou
 * `updateEventDetailsAction`, qui vérifient, eux, le droit sur l'événement et
 * que l'adresse vient bien de notre stockage.
 */

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé. Utilisez JPG, PNG ou WebP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Le fichier est trop volumineux (max 5 Mo)" }, { status: 400 });
    }

    const name = readBlobFilename(file.name, "banner.png");

    const blob = await put(`events/banners/${session.user.id}/${name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error("Erreur lors de l'upload d'une bannière d'événement:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
