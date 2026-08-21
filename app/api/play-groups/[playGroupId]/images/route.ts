import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { auth } from "@/lib/auth";
import { getPlayGroupById } from "@/lib/db/play-groups";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { canManagePlayGroup, readMemberRole } from "@/lib/play-groups/access";

/** Ce que le stockage accepte, et ce que `next.config.ts` sait afficher. */
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

/** 5 Mo, comme le téléversement des administrateurs : une bannière tient large en dessous. */
const MAX_SIZE = 5 * 1024 * 1024;

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
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou GIF." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Le fichier est trop volumineux (max 5 Mo)" }, { status: 400 });
    }

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
