import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  commentErrorStatus,
  deleteComment,
  editComment,
  postComment,
  readCommentThread,
  resolveComment,
  type CommentServiceError,
} from "@/lib/decks/comment-service";

type Params = Promise<{ deckId: string }>;

/**
 * Les commentaires d'un deck, pour l'application mobile. Mêmes règles que les
 * écrans (`lib/decks/comments.ts`), par le même service.
 *
 * L'espace est `personal` (l'auteur du deck seul) ou `group:<id>` (les membres
 * du groupe, tant que le deck y est). Une seule route pour le fil et pour un
 * commentaire du fil (`commentId` dans le corps ou l'adresse) : chaque segment
 * dynamique compte dans le plafond de routes d'un déploiement Vercel.
 */

function fail(error: CommentServiceError) {
  return NextResponse.json({ error }, { status: commentErrorStatus(error) });
}

async function readUserId(request: NextRequest): Promise<string | null> {
  return (await authenticateApiRequest(request))?.userId ?? null;
}

/** Le fil d'un espace (`?space=`). `markRead=1` note le passage du lecteur. */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { deckId } = await params;

  try {
    const result = await readCommentThread(deckId, request.nextUrl.searchParams.get("space"), await readUserId(request), {
      markRead: request.nextUrl.searchParams.get("markRead") === "1",
    });

    return result.ok ? NextResponse.json(result.thread) : fail(result.error);
  } catch (error) {
    console.error("Error reading deck comments:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const postSchema = z.object({
  space: z.string(),
  body: z.string(),
  cardIds: z.array(z.string()).optional(),
  parentId: z.string().optional(),
});

/** Écrire un commentaire, ou répondre à une racine (`parentId`). */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { deckId } = await params;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("INVALID");
  }

  try {
    const { space, ...input } = parsed.data;
    const result = await postComment(deckId, space, await readUserId(request), input);

    return result.ok ? NextResponse.json({ comment: result.comment }, { status: 201 }) : fail(result.error);
  } catch (error) {
    console.error("Error posting deck comment:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const patchSchema = z.union([
  z.object({ commentId: z.string(), body: z.string(), cardIds: z.array(z.string()).optional() }),
  z.object({ commentId: z.string(), resolved: z.boolean() }),
]);

/** Modifier un commentaire (son auteur), ou le marquer résolu (son auteur ou celui du deck). */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { deckId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("INVALID");
  }

  try {
    const userId = await readUserId(request);
    const data = parsed.data;
    const result =
      "resolved" in data
        ? await resolveComment(deckId, data.commentId, userId, data.resolved)
        : await editComment(deckId, data.commentId, userId, data);

    return result.ok ? NextResponse.json({ success: true }) : fail(result.error);
  } catch (error) {
    console.error("Error updating deck comment:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** Supprimer un commentaire (`?commentId=`) : son auteur, l'auteur du deck, ou un responsable du groupe. */
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { deckId } = await params;
  const commentId = request.nextUrl.searchParams.get("commentId");
  if (!commentId) {
    return fail("INVALID");
  }

  try {
    const result = await deleteComment(deckId, commentId, await readUserId(request));

    return result.ok ? NextResponse.json({ success: true }) : fail(result.error);
  } catch (error) {
    console.error("Error deleting deck comment:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
