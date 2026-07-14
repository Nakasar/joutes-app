import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getCollectionOverview } from "@/lib/db/collection";

export async function GET(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  const { playGroupId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const includeEmpty = request.nextUrl.searchParams.get("includeEmpty") === "true";

  try {
    const overview = await getCollectionOverview({ type: "playGroup", id: group.id }, { includeEmpty });
    return NextResponse.json(overview);
  } catch (error) {
    console.error("Error building play-group collection overview:", error);
    return NextResponse.json({ error: "Failed to build collection overview" }, { status: 500 });
  }
}
