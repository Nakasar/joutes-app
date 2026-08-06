import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteQuiz, getQuizById, updateQuiz } from "@/lib/db/quizzes";
import { deleteReportsForContent } from "@/lib/db/reports";
import { canManageQuiz } from "@/lib/quizzes/authorization";
import { updateQuizSchema } from "@/lib/schemas/quiz.schema";

type Params = { params: Promise<{ quizId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { quizId } = await params;

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: "Quizz introuvable" }, { status: 404 });
    }

    return NextResponse.json(quiz);
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
      return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
    }

    // Le quizz a disparu : ses éventuels signalements n'ont plus d'objet.
    await deleteReportsForContent({ contentType: "quiz", contentId: quizId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la suppression du quizz:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression du quizz" }, { status: 500 });
  }
}
