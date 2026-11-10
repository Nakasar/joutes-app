import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  addDecksToGroup,
  pinDeckInGroup,
  readGroupDeckLibrary,
  removeDeckFromGroup,
  type GroupDeckChange,
} from "@/lib/play-groups/deck-library";
import { filterGroupDecks, readGroupDeckFilters } from "@/lib/play-groups/decks";

type Params = Promise<{ playGroupId: string }>;

/**
 * La bibliothèque de decks du groupe, pour l'application mobile. Mêmes règles
 * que la vue `?view=decks` (`lib/play-groups/decks.ts`) : tout membre lit,
 * chacun n'y met que ses propres decks.
 *
 * Filtres facultatifs, mêmes clés que la vue : `jeu`, `legende`, `membre`,
 * `domaine`, `q`.
 *
 * Une seule route pour la liste et pour un deck de la liste (`deckId` dans le
 * corps ou l'adresse) : chaque segment dynamique compte dans le plafond de
 * routes d'un déploiement Vercel (voir `views.ts` du groupe).
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;

  try {
    const filters = readGroupDeckFilters(Object.fromEntries(request.nextUrl.searchParams));
    const entries = filterGroupDecks(await readGroupDeckLibrary(playGroupId), filters);

    return NextResponse.json({
      decks: entries.map(({ link, deck }) => ({
        ...link,
        deck: { ...deck, notes: undefined },
        canRemove: link.ownerId === gate.userId || gate.canManage,
      })),
    });
  } catch (error) {
    console.error("Error listing play-group decks:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const addSchema = z.object({ deckIds: z.array(z.string().min(1)).min(1).max(50) });

/** Partage des decks du lecteur au groupe. Les decks refusés sont listés avec leur raison. */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  try {
    const outcome = await addDecksToGroup(gate.group, gate, parsed.data.deckIds);
    return NextResponse.json(outcome, { status: outcome.added > 0 ? 201 : 200 });
  } catch (error) {
    console.error("Error adding play-group decks:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function respond(change: GroupDeckChange) {
  switch (change) {
    case "OK":
      return NextResponse.json({ success: true });
    case "NOT_FOUND":
      return NextResponse.json({ error: "Ce deck n'est pas dans le groupe" }, { status: 404 });
    case "FORBIDDEN":
      return NextResponse.json(
        { error: "Action réservée à l'auteur du deck ou aux responsables du groupe" },
        { status: 403 },
      );
  }
}

/** Retire un deck (`?deckId=`) : son auteur, ou un responsable du groupe. Le deck lui-même ne bouge pas. */
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;

  const deckId = request.nextUrl.searchParams.get("deckId");
  if (!deckId) {
    return NextResponse.json({ error: "deckId manquant" }, { status: 400 });
  }

  try {
    return respond(await removeDeckFromGroup(playGroupId, gate, deckId));
  } catch (error) {
    console.error("Error removing play-group deck:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const pinSchema = z.object({
  deckId: z.string().min(1),
  pinned: z.boolean(),
  note: z.string().trim().max(60).optional(),
});

/** Épingle ou désépingle un deck en tête de la bibliothèque (responsables du groupe). */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;

  const parsed = pinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  try {
    const pin = parsed.data.pinned ? { note: parsed.data.note || undefined } : null;
    return respond(await pinDeckInGroup(playGroupId, gate.role, parsed.data.deckId, pin));
  } catch (error) {
    console.error("Error pinning play-group deck:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
