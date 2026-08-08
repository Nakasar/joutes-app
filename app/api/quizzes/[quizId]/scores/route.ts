import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getQuizById } from "@/lib/db/quizzes";
import { recordQuizScore } from "@/lib/db/quiz-scores";
import { gradeSection } from "@/lib/quizzes/grade";
import { quizScoreSchema } from "@/lib/schemas/quiz.schema";

type Params = { params: Promise<{ quizId: string }> };

/**
 * Enregistre le score d'une section de quizz sur le profil du joueur.
 *
 * Le client envoie ses réponses, pas son score : c'est lui qui corrige à
 * l'écran pour répondre sans attendre le réseau, mais un score qu'il
 * annoncerait ne vaudrait rien. Le serveur recorrige donc les mêmes réponses
 * avant d'enregistrer, et rend ce qu'il a compté.
 *
 * Répondre à un quizz reste ouvert à tous ; seul l'enregistrement demande un
 * compte, faute de profil où ranger le score.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { quizId } = await params;
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const parsed = quizScoreSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: "Quizz introuvable" }, { status: 404 });
    }

    const score = gradeSection(quiz, parsed.data.blockId, parsed.data.answers);
    if (!score) {
      // Le bloc n'existe pas, ou ne termine pas une section : il n'y a rien à
      // noter. Le client a probablement une autre version du quizz en mémoire.
      return NextResponse.json({ error: "Section de quizz introuvable" }, { status: 404 });
    }

    await recordQuizScore({
      userId: session.user.id,
      quizId,
      blockId: parsed.data.blockId,
      correct: score.correct,
      total: score.total,
    });

    return NextResponse.json({ correct: score.correct, total: score.total });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du score de quizz:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement du score" }, { status: 500 });
  }
}
