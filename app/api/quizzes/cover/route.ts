import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { IMAGE_KINDS_WITH_GIF, readImageUpload } from "@/lib/media/image-upload";

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



export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const formData = await request.formData();
    const upload = await readImageUpload(formData, { kinds: IMAGE_KINDS_WITH_GIF, maxMegabytes: 5 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

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
