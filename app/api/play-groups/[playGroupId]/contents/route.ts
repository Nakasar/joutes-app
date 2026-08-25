import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import { addPlayGroupContent } from "@/lib/db/play-groups";
import { playGroupContentSchema } from "@/lib/schemas/play-group.schema";

type Params = Promise<{ playGroupId: string }>;

/**
 * Publie un contenu du groupe : un article, une vidéo ou un replay.
 *
 * **Ouvert à tous les membres**, contrairement aux annonces : écrire un compte
 * rendu de tournoi ou déposer sa vidéo n'est pas un acte de gouvernance. La
 * modification et la suppression restent à l'auteur et aux responsables.
 *
 * Le schéma refuse une vidéo sans adresse et un article sans texte : les deux
 * seraient une carte qui ne mène nulle part.
 *
 * En lecture, les contenus sortent par la vitrine
 * (`GET /play-groups/{playGroupId}/showcase`), qui est publique — c'est bien là
 * qu'ils sont faits pour être lus.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const parsed = playGroupContentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const content = {
      id: new ObjectId().toString(),
      ...parsed.data,
      authorId: gate.userId,
      publishedAt: new Date().toISOString(),
    };

    const updated = await addPlayGroupContent(playGroupId, content);
    if (!updated) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    return NextResponse.json({ content }, { status: 201 });
  } catch (error) {
    console.error("Error publishing play group content:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
