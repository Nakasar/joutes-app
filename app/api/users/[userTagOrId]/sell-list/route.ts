import { NextResponse } from "next/server";
import { getUserByTagOrId } from "@/lib/db/users";
import { getSellListForOwner } from "@/lib/db/sell-lists";

type Params = Promise<{ userTagOrId: string }>;

function resolveUserTagOrId(raw: string): string {
  if (raw.includes("#") || /^[0-9a-fA-F]{24}$/.test(raw)) {
    return raw;
  }
  const discriminator = raw.slice(-4);
  const displayName = raw.slice(0, -4);
  return `${displayName}#${discriminator}`;
}

/** Liste de vente d'un utilisateur (toujours publique), ou `null` s'il n'a rien mis en vente. */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  const user = await getUserByTagOrId(resolveUserTagOrId(decodeURIComponent(userTagOrId)));
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const sellList = await getSellListForOwner({ type: "user", id: user.id });
  return NextResponse.json({ sellList });
}
