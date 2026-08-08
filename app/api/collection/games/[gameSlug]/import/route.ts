import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { buildCollectionFormatContext } from "@/lib/collection/format-context";
import { collectionFormatsForGame, findCollectionFormat } from "@/lib/collection/formats";
import { resolvePrinting } from "@/lib/cards/printings";

/** Au-delà, c'est un fichier qui n'est pas une collection. */
const MAX_CSV_LENGTH = 5_000_000;

/**
 * Nombre d'exemplaires ajoutés en une fois. La collection stocke un document
 * par exemplaire : un fichier de plusieurs milliers de lignes avec des
 * quantités élevées produirait sinon une insertion démesurée.
 */
const MAX_IMPORTED_COPIES = 20_000;

/**
 * Importe un fichier de collection : les exemplaires lus s'**ajoutent** à la
 * collection existante, rien n'est remplacé ni supprimé.
 */
export async function POST(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { format: formatId, csv } = (body ?? {}) as { format?: unknown; csv?: unknown };

  const slug = game.slug ?? gameSlug;
  const format = typeof formatId === "string" ? findCollectionFormat(formatId, slug) : undefined;
  if (!format) {
    return NextResponse.json(
      {
        error: `Format inconnu pour ce jeu : « ${String(formatId)} ».`,
        formats: collectionFormatsForGame(slug).map((candidate) => candidate.id),
      },
      { status: 400 },
    );
  }

  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: "Le fichier à importer est vide" }, { status: 400 });
  }
  if (csv.length > MAX_CSV_LENGTH) {
    return NextResponse.json({ error: "Le fichier est trop volumineux" }, { status: 413 });
  }

  try {
    const context = await buildCollectionFormatContext(game);
    const { entries, issues } = format.fromCsv(csv, context);

    const copies = entries.reduce((total, entry) => total + entry.quantity, 0);
    if (copies > MAX_IMPORTED_COPIES) {
      return NextResponse.json(
        {
          error: `Ce fichier ajouterait ${copies} exemplaires, au-delà de la limite de ${MAX_IMPORTED_COPIES} par import.`,
        },
        { status: 413 },
      );
    }

    const userId = new ObjectId(session.user.id);
    const documents = entries.flatMap((entry) => {
      // La variante décide de l'illustration et peut imposer le foil, comme
      // lorsqu'on ajoute un exemplaire à la main depuis la fiche d'une carte.
      const printing = resolvePrinting(entry.card, entry.printingId);
      const document = {
        cardId: entry.card.id,
        setCode: entry.card.setCode,
        collectorNumber: entry.card.collectorNumber,
        name: entry.card.name,
        image: printing.image ?? entry.card.image,
        userId,
        foil: entry.foil || printing.foil,
        ...(printing.printingId !== undefined && { printingId: printing.printingId }),
        ...(printing.printingName !== undefined && { printingName: printing.printingName }),
        ...(entry.language !== undefined && { language: entry.language }),
        ...(entry.condition !== undefined && { condition: entry.condition }),
        ...(entry.grade !== undefined && { grade: entry.grade }),
        ...(entry.obtainedAt !== undefined && { obtainedAt: entry.obtainedAt }),
        ...(entry.acquisitionPrice !== undefined && { acquisitionPrice: entry.acquisitionPrice }),
        ...(entry.acquisitionCurrency !== undefined && {
          acquisitionCurrency: entry.acquisitionCurrency,
        }),
      };
      return Array.from({ length: entry.quantity }, () => ({ ...document }));
    });

    if (documents.length > 0) {
      await db.collection("collection-cards").insertMany(documents);
    }

    return NextResponse.json({
      added: documents.length,
      // Nombre de lignes du fichier retenues, pour distinguer « 3 lignes lues »
      // de « 12 exemplaires ajoutés ».
      rows: entries.length,
      issues,
    });
  } catch (error) {
    console.error("Erreur lors de l'import de la collection:", error);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
