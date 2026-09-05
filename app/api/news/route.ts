import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNews, createNews, getAllTags } from "@/lib/db/news";
import { hasPermission } from "@/lib/db/permissions";
import { createNewsSchema } from "@/lib/schemas/news.schema";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    const searchParams = request.nextUrl.searchParams;
    // Un jeu, ou plusieurs (`?gameId=a&gameId=b`) : le fil d'un client qui
    // suit plusieurs jeux les demande ensemble, et la lecture en base sait
    // déjà le faire. Un seul reste un seul, pour les caches qui le clé.
    const gameIdValues = searchParams.getAll("gameId").filter(Boolean);
    const gameId: string | string[] | undefined =
      gameIdValues.length === 0 ? undefined : gameIdValues.length === 1 ? gameIdValues[0] : gameIdValues;
    const tag = searchParams.get("tag") ?? undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10);
    const limit = !isNaN(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
    const includeTags = searchParams.get("includeTags") === "true";

    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (gameIdValues.some((value) => !objectIdRegex.test(value))) {
      return NextResponse.json({ error: "Paramètre gameId invalide" }, { status: 400 });
    }

    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: "Paramètre page invalide" }, { status: 400 });
    }

    const dateFromParsed = dateFrom ? new Date(dateFrom) : undefined;
    const dateToParsed = dateTo ? new Date(dateTo) : undefined;

    if (dateFromParsed && isNaN(dateFromParsed.getTime())) {
      return NextResponse.json({ error: "Paramètre dateFrom invalide" }, { status: 400 });
    }
    if (dateToParsed && isNaN(dateToParsed.getTime())) {
      return NextResponse.json({ error: "Paramètre dateTo invalide" }, { status: 400 });
    }

    const [result, tags] = await Promise.all([
      getNews({
        gameId,
        tag,
        dateFrom: dateFromParsed,
        dateTo: dateToParsed,
        page,
        limit,
        userId: session?.user?.id,
      }),
      includeTags ? getAllTags() : Promise.resolve(undefined),
    ]);

    return NextResponse.json({ ...result, ...(tags !== undefined ? { tags } : {}) });
  } catch (error) {
    console.error("Erreur lors de la récupération des actualités:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des actualités" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const canCreate = await hasPermission("news:update");
    if (!canCreate) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createNewsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const news = await createNews(parsed.data, session.user.id);
    return NextResponse.json(news, { status: 201 });
  } catch (error) {
    console.error("Erreur lors de la création de l'actualité:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'actualité" },
      { status: 500 }
    );
  }
}
