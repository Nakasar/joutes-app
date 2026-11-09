import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { auth } from "@/lib/auth";
import { getPlayGroupById } from "@/lib/db/play-groups";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { canManagePlayGroup, readMemberRole } from "@/lib/play-groups/access";
import { IMAGE_KINDS_WITH_GIF, readImageUpload } from "@/lib/media/image-upload";



/**
 * Le téléversement de l'emblème et de la bannière d'un groupe.
 *
 * La route existante `/api/upload` est réservée aux administrateurs de Joutes ;
 * celle-ci ouvre le même stockage au fondateur et aux admins **de ce groupe**,
 * et à eux seuls. Le fichier part chez Vercel Blob, dont l'hôte est le seul
 * déclaré dans `next.config.ts` : une image téléversée s'affiche donc partout,
 * là où une adresse tierce collée à la main pouvait être refusée.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  try {
    const { playGroupId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const group = await getPlayGroupById(playGroupId);
    if (!group) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    if (!canManagePlayGroup(readMemberRole(group, session.user.id))) {
      return NextResponse.json({ error: "Action réservée aux responsables du groupe" }, { status: 403 });
    }

    const formData = await request.formData();
    const upload = await readImageUpload(formData, { kinds: IMAGE_KINDS_WITH_GIF, maxMegabytes: 5 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

    // Le chemin porte l'identifiant du groupe, et un suffixe aléatoire :
    // deux groupes qui téléversent chacun leur « logo.png » ne s'écrasent pas,
    // et remplacer une image ne laisse pas l'ancienne servie par un cache.
    //
    // Le nom, lui, vient du client : sans nettoyage, un envoi fabriqué à la
    // main annonce `../../autre-groupe/logo.png` et va écrire hors du préfixe.
    const blob = await put(`play-groups/${playGroupId}/${readBlobFilename(file.name, "image")}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Erreur lors du téléversement d'une image de groupe:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
