import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getQuickAddSets, quickAddSet, QuickAddError } from "@/lib/db/collection-batches";
import { MAX_SET_FILL_COPIES } from "@/lib/collection/set-fill";
import { collectionLanguage } from "@/lib/schemas/collection.schema";

/**
 * Ajout rapide d'une extension à la collection personnelle.
 *
 * GET liste les extensions du jeu (tailles des sets de jeu et maître, raretés) ;
 * POST calcule l'ajout (`dryRun`) ou l'écrit, et renvoie alors l'identifiant du
 * lot, qui sert à l'annuler (`DELETE …/quick-add/<batchId>`).
 */

const requestSchema = z.object({
  setCode: z.string().trim().min(1).max(40),
  copies: z.number().int().min(1).max(MAX_SET_FILL_COPIES),
  mode: z.enum(["add", "fill"]).default("add"),
  scope: z.enum(["game", "master"]).default("game"),
  rarities: z.array(z.string().max(60)).max(30).optional(),
  language: collectionLanguage.optional(),
  foil: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

async function resolve(gameSlug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) } as const;
  }
  const game = await getGameBySlugOrId(gameSlug);
  if (!game) {
    return { error: NextResponse.json({ error: "Jeu introuvable" }, { status: 404 }) } as const;
  }
  return { userId: session.user.id, game } as const;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ gameSlug: string }> }) {
  const { gameSlug } = await params;
  const resolved = await resolve(gameSlug);
  if ("error" in resolved) return resolved.error;

  try {
    return NextResponse.json({ sets: await getQuickAddSets(resolved.game) });
  } catch (error) {
    console.error("Erreur lors de la lecture des extensions:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture des extensions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ gameSlug: string }> }) {
  const { gameSlug } = await params;
  const resolved = await resolve(gameSlug);
  if ("error" in resolved) return resolved.error;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide", details: parsed.error.flatten() }, { status: 400 });
  }
  const { dryRun, ...options } = parsed.data;

  try {
    const result = await quickAddSet(resolved.game, resolved.userId, options, { dryRun });
    return NextResponse.json(result, { status: dryRun || !result.batchId ? 200 : 201 });
  } catch (error) {
    if (error instanceof QuickAddError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Erreur lors de l'ajout de l'extension:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout de l'extension" }, { status: 500 });
  }
}
