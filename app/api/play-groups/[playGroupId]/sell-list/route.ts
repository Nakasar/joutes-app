import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPlayGroupById, getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getOrCreateSellListForOwner, getSellListForOwner } from "@/lib/db/sell-lists";

type Params = Promise<{ playGroupId: string }>;

/**
 * The play group's sell list. Sell lists are always publicly viewable (like
 * `GET /sell-lists/{id}`), so session is optional and only used to decide
 * whether to lazily create the list for a member landing on an empty group —
 * mirrors the web app's `/play-groups/{id}/sell-list` page.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const membership = session?.user?.id
    ? await getPlayGroupByIdAndUser(playGroupId, session.user.id)
    : null;

  try {
    let sellList = await getSellListForOwner({ type: "playGroup", id: group.id });
    if (!sellList && membership) {
      sellList = await getOrCreateSellListForOwner({ type: "playGroup", id: group.id });
    }
    return NextResponse.json({ sellList, canEdit: !!membership });
  } catch (error) {
    console.error("Error fetching play-group sell list:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
