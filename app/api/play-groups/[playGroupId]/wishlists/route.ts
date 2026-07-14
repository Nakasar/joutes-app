import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { createWishlist, getWishlistsForOwner } from "@/lib/db/wishlists";
import { wishlistSchema } from "@/lib/schemas/wishlist.schema";

type Params = Promise<{ playGroupId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  try {
    const wishlists = await getWishlistsForOwner({ type: "playGroup", id: group.id });
    return NextResponse.json({ wishlists });
  } catch (error) {
    console.error("Error fetching play-group wishlists:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const validationResult = wishlistSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  try {
    const wishlist = await createWishlist({ type: "playGroup", id: group.id }, validationResult.data);
    return NextResponse.json(wishlist, { status: 201 });
  } catch (error) {
    console.error("Error creating play-group wishlist:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
