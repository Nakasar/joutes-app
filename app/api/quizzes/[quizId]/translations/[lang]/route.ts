import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { deleteQuizTranslation, getQuizById, upsertQuizTranslation } from "@/lib/db/quizzes";
import { canManageQuiz } from "@/lib/quizzes/authorization";
import { quizTranslationSchema } from "@/lib/schemas/quiz.schema";
import type { Quiz } from "@/lib/types/Quiz";
import { locales, type Locale } from "@/i18n/config";

function parseLang(lang: string): Locale | null {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : null;
}

/**
 * Traduire un quizz, c'est en modifier le contenu affiché : même règle que la
 * modification — son auteur, ou la modération (`quizzes:update-all`).
 * Renvoie le quizz pour éviter de le relire ensuite.
 */
async function authorize(
  quizId: string,
): Promise<{ denied: NextResponse } | { denied: null; quiz: Quiz }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { denied: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const quiz = await getQuizById(quizId);
  if (!quiz) {
    return { denied: NextResponse.json({ error: "Quizz non trouvé" }, { status: 404 }) };
  }

  if (!(await canManageQuiz(quiz, session.user.id))) {
    return { denied: NextResponse.json({ error: "Permission refusée" }, { status: 403 }) };
  }

  return { denied: null, quiz };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string; lang: string }> }
) {
  const { quizId, lang } = await params;

  const authorized = await authorize(quizId);
  if (authorized.denied) return authorized.denied;

  const locale = parseLang(lang);
  if (!locale) {
    return NextResponse.json({ error: "Langue non prise en charge" }, { status: 400 });
  }

  if (locale === authorized.quiz.originalLang) {
    return NextResponse.json(
      { error: "La langue d'origine du quizz ne se traduit pas" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = quizTranslationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const saved = await upsertQuizTranslation(quizId, locale, parsed.data);
  if (!saved) {
    return NextResponse.json({ error: "Quizz non trouvé" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ quizId: string; lang: string }> }
) {
  const { quizId, lang } = await params;

  const authorized = await authorize(quizId);
  if (authorized.denied) return authorized.denied;

  const locale = parseLang(lang);
  if (!locale) {
    return NextResponse.json({ error: "Langue non prise en charge" }, { status: 400 });
  }

  const removed = await deleteQuizTranslation(quizId, locale);
  if (!removed) {
    return NextResponse.json({ error: "Quizz non trouvé" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
