import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getCubeAccess,
  getCubeById,
  getCubePack,
  getCubePackCards,
  importCardsIntoCubePack,
} from "@/lib/db/cubes";
import { resolveCardListEntries } from "@/lib/db/cube-import";
import { formatCardListEntry, parseCardList } from "@/lib/cubes/card-list";
import {
  CUBE_IMPORT_MAX_CARDS,
  CUBE_IMPORT_MAX_LINES,
  CUBE_PACK_CARD_MAX_QUANTITY,
} from "@/lib/constants/cubes";
import { cubePackImportSchema } from "@/lib/schemas/cube.schema";
import type { CubeCard } from "@/lib/types/Cube";

/** L'éditeur n'affiche que l'identité des cartes : la date de création reste côté serveur. */
function toPackCard({ id, cardId, name, setCode, collectorNumber, image }: CubeCard) {
  return { id, cardId, name, setCode, collectorNumber, image };
}

/**
 * Import d'une liste de cartes dans un paquet. Chaque ligne est rapprochée de
 * la base du jeu ; les lignes sans correspondance sont renvoyées à
 * l'utilisateur plutôt que d'annuler tout l'import, qui serait alors bloqué par
 * une seule faute de frappe.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session.user.id).canEdit) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const pack = await getCubePack(cubeId, packId);
  if (!pack) {
    return NextResponse.json({ error: "Paquet introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const validation = cubePackImportSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const { text, mode } = validation.data;
  const { entries, invalidLines } = parseCardList(text);
  // Une liste dont rien n'est une carte est refusée : en mode « remplacer »,
  // elle viderait le paquet sans que l'utilisateur l'ait demandé.
  if (entries.length === 0) {
    return NextResponse.json({ error: "La liste ne contient aucune carte" }, { status: 400 });
  }
  if (entries.length > CUBE_IMPORT_MAX_LINES) {
    return NextResponse.json(
      { error: `La liste dépasse ${CUBE_IMPORT_MAX_LINES} lignes de cartes` },
      { status: 400 },
    );
  }

  const [{ resolved, unresolved }, current] = await Promise.all([
    resolveCardListEntries(new ObjectId(cube.gameId), entries),
    getCubePackCards(packId),
  ]);

  // Une liste dont aucune carte n'a été retrouvée laisse le paquet en l'état :
  // en mode « remplacer », l'écraser par rien ferait perdre son contenu pour
  // une extension mal orthographiée.
  if (resolved.length === 0) {
    return NextResponse.json({
      imported: 0,
      unresolved: unresolved.map(formatCardListEntry),
      invalidLines,
      cards: current.map(toPackCard),
    });
  }

  // Les exemplaires déjà présents comptent dans la limite par carte : ajouter
  // une liste à un paquet ne doit pas la faire sauter.
  const existing = mode === "replace" ? [] : current;
  const counts = new Map<string, number>();
  for (const card of existing) {
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
  }

  const toInsert: { cardId: string; name: string; setCode: string; collectorNumber: string; image: string }[] = [];
  for (const { entry, card } of resolved) {
    const already = counts.get(card.cardId) ?? 0;
    const added = Math.min(entry.quantity, CUBE_PACK_CARD_MAX_QUANTITY - already);
    if (added <= 0) {
      continue;
    }
    counts.set(card.cardId, already + added);
    for (let index = 0; index < added; index += 1) {
      toInsert.push(card);
    }
  }

  if (existing.length + toInsert.length > CUBE_IMPORT_MAX_CARDS) {
    return NextResponse.json(
      { error: `Un paquet ne peut pas dépasser ${CUBE_IMPORT_MAX_CARDS} cartes` },
      { status: 400 },
    );
  }

  const cards = await importCardsIntoCubePack(cubeId, packId, toInsert, mode);

  return NextResponse.json({
    imported: toInsert.length,
    unresolved: unresolved.map(formatCardListEntry),
    invalidLines,
    // Le paquet complet évite au client de recalculer son contenu, comme pour
    // les modifications carte à carte.
    cards: cards.map(toPackCard),
  });
}
