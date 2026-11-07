import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getGameBySlugOrId } from "@/lib/db/games";
import { buildCollectionFormatContext } from "@/lib/collection/format-context";
import { collectionFormatsForGame, findCollectionFormat } from "@/lib/collection/formats";
import { resolveImportIssues } from "@/lib/collection/formats/resolve";
import { copyDocuments } from "@/lib/collection/copy-documents";
import { countGameCopies, writeImport } from "@/lib/db/collection-batches";

/** Au-delà, c'est un fichier qui n'est pas une collection. */
const MAX_CSV_LENGTH = 5_000_000;

/**
 * Nombre d'exemplaires ajoutés en une fois. La collection stocke un document
 * par exemplaire : un fichier de plusieurs milliers de lignes avec des
 * quantités élevées produirait sinon une insertion démesurée.
 */
const MAX_IMPORTED_COPIES = 20_000;

/**
 * Importe un fichier de collection, en deux temps :
 *
 * 1. `dryRun: true` lit le fichier sans rien écrire et renvoie ce qu'il
 *    contient : lignes reconnues, exemplaires, lignes ambiguës avec leurs
 *    cartes possibles, lignes introuvables.
 * 2. Le même fichier, avec `resolutions` (ligne → carte choisie parmi les
 *    candidats) et `mode` : `add` ajoute les exemplaires à la collection,
 *    `replace` retire d'abord ceux du jeu pour qu'elle reflète le fichier.
 *
 * Les exemplaires importés portent un même `batchId`, renvoyé pour pouvoir
 * annuler un ajout.
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

  const {
    format: formatId,
    csv,
    dryRun,
    resolutions,
    mode,
  } = (body ?? {}) as { format?: unknown; csv?: unknown; dryRun?: unknown; resolutions?: unknown; mode?: unknown };

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
  if (mode !== undefined && mode !== "add" && mode !== "replace") {
    return NextResponse.json({ error: `Mode inconnu : « ${String(mode)} ».` }, { status: 400 });
  }

  const chosen: Record<string, string> = {};
  if (resolutions && typeof resolutions === "object") {
    for (const [line, cardId] of Object.entries(resolutions as Record<string, unknown>)) {
      if (typeof cardId === "string" && cardId) chosen[line] = cardId;
    }
  }

  try {
    const context = await buildCollectionFormatContext(game);
    const { entries, issues } = resolveImportIssues(format.fromCsv(csv, context), chosen);

    const copies = entries.reduce((total, entry) => total + entry.quantity, 0);
    if (copies > MAX_IMPORTED_COPIES) {
      return NextResponse.json(
        {
          error: `Ce fichier ajouterait ${copies} exemplaires, au-delà de la limite de ${MAX_IMPORTED_COPIES} par import.`,
        },
        { status: 413 },
      );
    }

    const publicIssues = issues.map(({ pending, candidates, ...issue }) => ({
      ...issue,
      // Ce que la ligne ajouterait une fois sa carte choisie.
      ...(pending ? { quantity: pending.quantity } : {}),
      ...(candidates?.length
        ? {
            candidates: candidates.map((card) => ({
              id: card.id,
              name: card.name,
              setCode: card.setCode,
              collectorNumber: card.collectorNumber,
              ...(card.rarity ? { rarity: card.rarity } : {}),
            })),
          }
        : {}),
    }));

    if (dryRun === true) {
      return NextResponse.json({
        rows: entries.length,
        copies,
        issues: publicIssues,
        // Ce qu'un remplacement retirerait : à annoncer avant de le proposer.
        currentCopies: await countGameCopies(session.user.id, game.id),
      });
    }

    const userId = new ObjectId(session.user.id);
    const batchId = new ObjectId();
    const documents = entries.flatMap((entry) => copyDocuments(entry, userId, batchId));
    const { removed } = await writeImport(session.user.id, game.id, documents, { replace: mode === "replace" });

    return NextResponse.json({
      added: documents.length,
      // Nombre de lignes du fichier retenues, pour distinguer « 3 lignes lues »
      // de « 12 exemplaires ajoutés ».
      rows: entries.length,
      removed,
      issues: publicIssues,
      // Un remplacement ne s'annule pas : les exemplaires retirés sont perdus.
      ...(documents.length > 0 && mode !== "replace" ? { batchId: batchId.toHexString() } : {}),
    });
  } catch (error) {
    console.error("Erreur lors de l'import de la collection:", error);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
