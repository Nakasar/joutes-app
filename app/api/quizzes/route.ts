import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getQuizzes, createQuiz } from "@/lib/db/quizzes";
import { hasPermission } from "@/lib/db/permissions";
import { createQuizSchema } from "@/lib/schemas/quiz.schema";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const gameId = searchParams.get("gameId") ?? undefined;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10);
    const limit = !isNaN(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;

    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (gameId && !objectIdRegex.test(gameId)) {
      return NextResponse.json({ error: "Paramètre gameId invalide" }, { status: 400 });
    }
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: "Paramètre page invalide" }, { status: 400 });
    }

    const result = await getQuizzes({ gameId, page, limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur lors de la récupération des quizz:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des quizz" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const canCreate = await hasPermission("quizzes:update");
    if (!canCreate) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createQuizSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const quiz = await createQuiz(parsed.data, session.user.id);
    return NextResponse.json(quiz, { status: 201 });
  } catch (error) {
    console.error("Erreur lors de la création du quizz:", error);
    return NextResponse.json({ error: "Erreur lors de la création du quizz" }, { status: 500 });
  }
}
