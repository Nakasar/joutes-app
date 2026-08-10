import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { removeProductEntry, updateProductEntry } from "@/lib/db/products-collection";
import { collectionProductPatchSchema } from "@/lib/schemas/collection.schema";

/**
 * L'unité manipulée ici est l'**exemplaire**, pas le produit : deux boîtes
 * identiques sont deux objets distincts, dont l'une peut être scellée et
 * l'autre à moitié peinte.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const validated = collectionProductPatchSchema.safeParse(raw);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid entry data", details: validated.error }, { status: 400 });
  }

  try {
    const updated = await updateProductEntry(
      { type: "user", id: session.user.id },
      entryId,
      validated.data
    );

    if (!updated) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating product entry:", error);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

/** Retire l'exemplaire et, s'il s'agit d'un conteneur, ce qu'il a apporté. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await removeProductEntry({ type: "user", id: session.user.id }, entryId);
    if (!result) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, removed: result.removed });
  } catch (error) {
    console.error("Error removing product entry:", error);
    return NextResponse.json({ error: "Failed to remove entry" }, { status: 500 });
  }
}
