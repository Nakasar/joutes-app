import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getCollectionEntriesForExport } from "@/lib/db/collection";
import { buildCollectionFormatContext } from "@/lib/collection/format-context";
import {
  collectionExportFileName,
  collectionFormatsForGame,
  findCollectionFormat,
} from "@/lib/collection/formats";

/**
 * Exporte la collection du compte connecté pour un jeu, dans le format demandé.
 * La réponse est le fichier CSV lui-même : le client n'a qu'à le télécharger.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameSlug: string }> },
) {
  const { gameSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Jeu introuvable" }, { status: 404 });
  }

  const slug = game.slug ?? gameSlug;
  const formatId = request.nextUrl.searchParams.get("format") ?? "joutes";
  const format = findCollectionFormat(formatId, slug);
  if (!format) {
    return NextResponse.json(
      {
        error: `Format inconnu pour ce jeu : « ${formatId} ».`,
        formats: collectionFormatsForGame(slug).map((candidate) => candidate.id),
      },
      { status: 400 },
    );
  }

  try {
    const [groups, context] = await Promise.all([
      getCollectionEntriesForExport({ type: "user", id: session.user.id }, game.id),
      buildCollectionFormatContext(game),
    ]);

    const csv = format.toCsv(groups, context);
    const fileName = collectionExportFileName(slug, format, new Date());

    // Le BOM fait ouvrir le fichier en UTF-8 par Excel, qui suppose sinon
    // l'encodage local et abîme les noms de cartes accentués. Les lecteurs CSV
    // le tolèrent, et le nôtre le retire à la relecture.
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'export de la collection:", error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}
