import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer, type PlayGroupViewer } from "@/lib/api/play-groups";
import { removePlayGroupContent, updatePlayGroupContent } from "@/lib/db/play-groups";
import { playGroupContentSchema } from "@/lib/schemas/play-group.schema";
import type { PlayGroupContentItem } from "@/lib/types/PlayGroup";

type Params = Promise<{ playGroupId: string; contentId: string }>;

/**
 * Qui peut toucher à un contenu : son auteur, ou un responsable.
 *
 * Écrire est ouvert à tous les membres ; réécrire ce qu'un autre a écrit ne
 * l'est pas. C'est le partage de `updatePlayGroupContent` côté web.
 */
function mayEdit(gate: PlayGroupViewer, content: PlayGroupContentItem): boolean {
  return gate.canManage || content.authorId === gate.userId;
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, contentId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const existing = (gate.group.options?.contents ?? []).find((item) => item.id === contentId);
    if (!existing) {
      return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
    }

    if (!mayEdit(gate, existing)) {
      return NextResponse.json(
        { error: "Action réservée à l'auteur du contenu et aux responsables" },
        { status: 403 },
      );
    }

    const parsed = playGroupContentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await updatePlayGroupContent(playGroupId, contentId, parsed.data);

    return NextResponse.json({
      content: updated?.options?.contents?.find((item) => item.id === contentId) ?? null,
    });
  } catch (error) {
    console.error("Error updating play group content:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, contentId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const existing = (gate.group.options?.contents ?? []).find((item) => item.id === contentId);
    if (!existing) {
      return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
    }

    if (!mayEdit(gate, existing)) {
      return NextResponse.json(
        { error: "Action réservée à l'auteur du contenu et aux responsables" },
        { status: 403 },
      );
    }

    await removePlayGroupContent(playGroupId, contentId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting play group content:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
