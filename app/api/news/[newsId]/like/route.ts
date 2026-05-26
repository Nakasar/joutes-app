import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toggleLikeNews } from "@/lib/db/news";
import { headers } from "next/headers";

type Params = { params: Promise<{ newsId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { newsId } = await params;
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const result = await toggleLikeNews(newsId, session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur lors du like:", error);
    return NextResponse.json({ error: "Erreur lors du like" }, { status: 500 });
  }
}
