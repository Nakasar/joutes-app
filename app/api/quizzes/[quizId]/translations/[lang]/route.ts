import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/db/permissions";
import { deleteQuizTranslation, getQuizById, upsertQuizTranslation } from "@/lib/db/quizzes";
import { quizTranslationSchema } from "@/lib/schemas/quiz.schema";
import { locales, type Locale } from "@/i18n/config";

function parseLang(lang: string): Locale | null {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : null;
}

/** Traduire un quizz relève de la même permission que l'écrire. */
async function authorize(): Promise<NextResponse | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!(await hasPermission("quizzes:update"))) {
    return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
  }
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string; lang: string }> }
) {
  const { quizId, lang } = await params;

  const denied = await authorize();
  if (denied) return denied;

  const locale = parseLang(lang);
  if (!locale) {
    return NextResponse.json({ error: "Langue non prise en charge" }, { status: 400 });
  }

  const quiz = await getQuizById(quizId);
  if (!quiz) {
    return NextResponse.json({ error: "Quizz non trouvé" }, { status: 404 });
  }
  if (locale === quiz.originalLang) {
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

  const denied = await authorize();
  if (denied) return denied;

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
