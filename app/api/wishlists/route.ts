import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createWishlist, getWishlistsForOwner } from "@/lib/db/wishlists";
import { wishlistSchema } from "@/lib/schemas/wishlist.schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const wishlists = await getWishlistsForOwner({ type: "user", id: session.user.id });
    return NextResponse.json({ wishlists });
  } catch (error) {
    console.error("Error fetching wishlists:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
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
    const wishlist = await createWishlist({ type: "user", id: session.user.id }, validationResult.data);
    return NextResponse.json(wishlist, { status: 201 });
  } catch (error) {
    console.error("Error creating wishlist:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
