import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/db/permissions";
import { deleteNewsTranslation, getNewsById, upsertNewsTranslation } from "@/lib/db/news";
import { newsTranslationSchema } from "@/lib/schemas/news.schema";
import { newsOriginalLang, parseLocale } from "@/lib/news/localize";
import type { News } from "@/lib/types/News";

/**
 * Les traductions d'une actualité, langue par langue.
 *
 * Traduire, c'est modifier ce que le visiteur lit : même droit que rédiger,
 * `news:update`.
 */

async function authorize(
  newsId: string
): Promise<{ denied: NextResponse } | { denied: null; news: News }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { denied: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  if (!(await hasPermission("news:update"))) {
    return { denied: NextResponse.json({ error: "Permission refusée" }, { status: 403 }) };
  }

  const news = await getNewsById(newsId);
  if (!news) {
    return { denied: NextResponse.json({ error: "Actualité introuvable" }, { status: 404 }) };
  }

  return { denied: null, news };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ newsId: string; lang: string }> }) {
  const { newsId, lang } = await params;

  const authorized = await authorize(newsId);
  if (authorized.denied) return authorized.denied;

  const locale = parseLocale(lang);
  if (!locale) {
    return NextResponse.json({ error: "Langue non prise en charge" }, { status: 400 });
  }
  if (locale === newsOriginalLang(authorized.news)) {
    return NextResponse.json(
      { error: "La langue d'origine de l'actualité ne se traduit pas" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = newsTranslationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Une traduction dont les trois textes sont vides n'en est pas une : elle
  // n'apparaîtrait nulle part (`availableNewsLangs` l'écarte) et son adresse
  // répondrait 404. Vider les champs et enregistrer, c'est retirer la langue —
  // ce que l'éditeur annonce en le faisant.
  const isEmpty = !parsed.data.title.trim() && !parsed.data.summary.trim() && !parsed.data.content.trim();

  const saved = isEmpty
    ? await deleteNewsTranslation(newsId, locale)
    : await upsertNewsTranslation(newsId, locale, parsed.data);

  if (!saved) {
    return NextResponse.json({ error: "Actualité introuvable" }, { status: 404 });
  }

  return NextResponse.json({ success: true, removed: isEmpty });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ newsId: string; lang: string }> }
) {
  const { newsId, lang } = await params;

  const authorized = await authorize(newsId);
  if (authorized.denied) return authorized.denied;

  const locale = parseLocale(lang);
  if (!locale) {
    return NextResponse.json({ error: "Langue non prise en charge" }, { status: 400 });
  }

  const removed = await deleteNewsTranslation(newsId, locale);
  if (!removed) {
    return NextResponse.json({ error: "Actualité introuvable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
