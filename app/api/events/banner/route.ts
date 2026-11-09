import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { STILL_IMAGE_KINDS, readImageUpload } from "@/lib/media/image-upload";

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


export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const formData = await request.formData();
    const upload = await readImageUpload(formData, { kinds: STILL_IMAGE_KINDS, maxMegabytes: 5 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

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
