import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteQuiz, getQuizById, updateQuiz } from "@/lib/db/quizzes";
import { deleteReportsForContent } from "@/lib/db/reports";
import { canManageQuiz } from "@/lib/quizzes/authorization";
import { quizContentTexts } from "@/lib/quizzes/content";
import { resolveCardMentions } from "@/lib/game-content-cards";
import { updateQuizSchema } from "@/lib/schemas/quiz.schema";
import { ObjectId } from "mongodb";

type Params = { params: Promise<{ quizId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { quizId } = await params;

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: "Quizz introuvable" }, { status: 404 });
    }

    // Quiz prose is annotated markdown. Resolving `[Card Name]` mentions needs
    // the game's cards, which a client has no way to look up itself — the web
    // page does this server-side too. Translations are covered as well: a
    // reader switches language without asking us again.
    const { cardIdByName, cardsById } = quiz.gameId
      ? await resolveCardMentions(new ObjectId(quiz.gameId), quizContentTexts(quiz))
      : { cardIdByName: {}, cardsById: {} };

    return NextResponse.json({ ...quiz, cardIdByName, cardsById });
  } catch (error) {
    console.error("Erreur lors de la récupération du quizz:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération du quizz" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { quizId } = await params;
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: "Quizz introuvable" }, { status: 404 });
    }

    if (!(await canManageQuiz(quiz, session.user.id))) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateQuizSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateQuiz(quizId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
    }

    const updatedQuiz = await getQuizById(quizId);
    return NextResponse.json(updatedQuiz);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du quizz:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour du quizz" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { quizId } = await params;
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: "Quizz introuvable" }, { status: 404 });
    }

    if (!(await canManageQuiz(quiz, session.user.id))) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const deleted = await deleteQuiz(quizId);
    if (!deleted) {
      // Le quizz existait à la lecture juste au-dessus : s'il a disparu entre
      // les deux, c'est une suppression concurrente, pas une panne.
      return NextResponse.json({ error: "Quizz introuvable" }, { status: 404 });
    }

    // Le quizz a disparu : ses éventuels signalements n'ont plus d'objet. Au
    // mieux : la suppression est faite et irréversible, échouer ici renverrait
    // une erreur sur une opération réussie et inviterait le client à réessayer.
    try {
      await deleteReportsForContent({ contentType: "quiz", contentId: quizId });
    } catch (error) {
      console.error("Signalements du quizz supprimé non purgés:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la suppression du quizz:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression du quizz" }, { status: 500 });
  }
}
