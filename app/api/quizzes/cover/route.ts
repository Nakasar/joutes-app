import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { readBlobFilename } from "@/lib/media/blob-filename";

/**
 * Le dépôt de l'image de couverture d'un quizz.
 *
 * Le droit se vérifie sur **la session**, et non sur un quizz : la couverture
 * se choisit dans le formulaire, avant que le quizz n'existe. C'est le bon
 * niveau — écrire un quizz est ouvert à tout compte connecté, déposer l'image
 * qui l'illustrera ne demande donc rien de plus.
 *
 * La route ne fait que déposer et rendre l'adresse. C'est l'enregistrement du
 * quizz (`POST /quizzes` ou `PATCH /quizzes/{quizId}`) qui l'inscrit ensuite :
 * le fichier existe, mais rien ne l'illustre tant que son auteur n'a pas validé.
 */

/** Ce que le stockage accepte, et ce que les écrans savent afficher. */
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

/** 5 Mo, comme les autres dépôts d'images : un bandeau tient large en dessous. */
const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
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

    // Le chemin porte le compte déposant, et un suffixe aléatoire : deux
    // personnes qui déposent chacune leur « cover.png » ne s'écrasent pas, et
    // remplacer une couverture ne laisse pas l'ancienne servie par un cache.
    //
    // Le nom, lui, vient du client : sans nettoyage, un envoi fabriqué à la
    // main annonce `../../autre-compte/cover.png` et va écrire hors du préfixe.
    const blob = await put(
      `quizzes/covers/${session.user.id}/${readBlobFilename(file.name, "cover")}`,
      file,
      { access: "public", addRandomSuffix: true },
    );

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Erreur lors de l'upload de la couverture d'un quizz:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
