import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { removeCollectionBatch } from "@/lib/db/collection-batches";

/**
 * Annule un lot d'exemplaires (ajout d'une extension, import) : seuls les
 * exemplaires de ce lot, et de la personne connectée, sont retirés.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const removed = await removeCollectionBatch(session.user.id, batchId);
    return NextResponse.json({ removed });
  } catch (error) {
    console.error("Erreur lors de l'annulation du lot:", error);
    return NextResponse.json({ error: "Erreur lors de l'annulation" }, { status: 500 });
  }
}
