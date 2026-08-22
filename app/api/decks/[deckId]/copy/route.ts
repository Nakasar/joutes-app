import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { copyDeckForPlayer, getDeckById } from "@/lib/db/decks";
import { deckIdSchema } from "@/lib/schemas/deck.schema";

type Params = Promise<{ deckId: string }>;

/**
 * « Copier chez moi » : reprendre la liste d'un deck publié pour la faire
 * sienne.
 *
 * Seuls les decks accessibles se copient — un deck privé d'un autre joueur ne
 * l'est pas, et un deck non répertorié ne se copie que par celui qui en a le
 * lien, donc qui est déjà sur sa page. La copie arrive privée : publier la
 * liste de quelqu'un d'autre est une décision, pas un effet de bord.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const { deckId } = await params;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (!deckIdSchema.safeParse(deckId).success) {
      return NextResponse.json({ error: "ID de deck invalide" }, { status: 400 });
    }

    const source = await getDeckById(deckId);
    if (!source) {
      return NextResponse.json({ error: "Deck non trouvé" }, { status: 404 });
    }

    if (source.visibility === "private" && source.playerId !== session.user.id) {
      return NextResponse.json(
        { error: "Vous n'avez pas l'autorisation de copier ce deck" },
        { status: 403 }
      );
    }

    const copy = await copyDeckForPlayer(source, session.user.id);

    revalidatePath("/decks");
    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    console.error("Error copying deck:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
