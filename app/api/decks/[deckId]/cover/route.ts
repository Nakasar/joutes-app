import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getDeckById } from "@/lib/db/decks";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { deckIdSchema } from "@/lib/schemas/deck.schema";

/**
 * Le dépôt de l'image de couverture d'un deck.
 *
 * Une route à part de `/api/upload`, qui n'ouvre qu'aux administrateurs de
 * Joutes : ici c'est l'auteur du deck qui dépose, et le droit se vérifie donc
 * sur **la propriété du deck**, comme pour les images d'un groupe de jeu.
 *
 * La route ne fait que déposer et rendre l'adresse. C'est un `PATCH` du deck
 * qui l'inscrit ensuite sur la liste — le fichier existe, mais rien ne
 * l'illustre tant que son auteur n'a pas validé son choix.
 */

/** Ce que le stockage accepte, et ce que `next.config.ts` sait afficher. */
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

/** 5 Mo, comme les autres dépôts d'images : un bandeau tient large en dessous. */
const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  try {
    const { deckId } = await params;

    if (!deckIdSchema.safeParse(deckId).success) {
      return NextResponse.json({ error: "ID de deck invalide" }, { status: 400 });
    }

    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const deck = await getDeckById(deckId);

    if (!deck) {
      return NextResponse.json({ error: "Deck non trouvé" }, { status: 404 });
    }

    if (deck.playerId !== session.user.id) {
      return NextResponse.json(
        { error: "Vous n'avez pas l'autorisation de modifier ce deck" },
        { status: 403 },
      );
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

    // Le chemin porte l'identifiant du deck, et un suffixe aléatoire : deux
    // decks qui déposent chacun leur « cover.png » ne s'écrasent pas, et
    // remplacer une couverture ne laisse pas l'ancienne servie par un cache.
    //
    // Le nom, lui, vient du client : sans nettoyage, un envoi fabriqué à la
    // main annonce `../../autre-deck/cover.png` et va écrire hors du préfixe.
    const blob = await put(`decks/${deckId}/${readBlobFilename(file.name, "cover")}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Erreur lors du téléversement d'une couverture de deck:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
