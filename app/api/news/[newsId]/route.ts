import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsById, updateNews } from "@/lib/db/news";
import { hasPermission } from "@/lib/db/permissions";
import { updateNewsSchema } from "@/lib/schemas/news.schema";
import { headers } from "next/headers";

type Params = { params: Promise<{ newsId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { newsId } = await params;
    const session = await auth.api.getSession({ headers: await headers() });

    const news = await getNewsById(newsId, session?.user?.id);
    if (!news) {
      return NextResponse.json({ error: "Actualité introuvable" }, { status: 404 });
    }

    return NextResponse.json(news);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'actualité:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'actualité" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { newsId } = await params;
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const canEdit = await hasPermission("news:update");
    if (!canEdit) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const news = await getNewsById(newsId);
    if (!news) {
      return NextResponse.json({ error: "Actualité introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateNewsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateNews(newsId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
    }

    const updatedNews = await getNewsById(newsId, session.user.id);
    return NextResponse.json(updatedNews);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'actualité:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'actualité" },
      { status: 500 }
    );
  }
}
