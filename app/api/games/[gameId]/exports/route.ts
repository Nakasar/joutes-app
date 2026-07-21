import {NextResponse} from "next/server";
import {put} from "@vercel/blob";
import {ObjectId} from "mongodb";
import db from "@/lib/mongodb";
import {getGameBySlugOrId} from "@/lib/db/games";
import {countErratasByGameId, getErratasByGameId} from "@/lib/db/erratas";
import {countAllPolicies, getAllPolicies} from "@/lib/db/policies";
import {getRawEntries} from "@/lib/rules/riftbound";
import {createGameExport, getRecentGameExport} from "@/lib/db/game-exports";

const EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getRulesExport(gameSlug: string | undefined) {
  if (gameSlug !== 'riftbound') {
    return undefined;
  }

  return {
    en: {tr: getRawEntries('TR', 'en'), cr: getRawEntries('CR', 'en')},
    fr: {tr: getRawEntries('TR', 'fr'), cr: getRawEntries('CR', 'fr')},
  };
}

export async function GET(request: Request, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const existingExport = await getRecentGameExport(game.id, EXPORT_MAX_AGE_MS);
  if (existingExport) {
    return NextResponse.json({
      url: existingExport.url,
      size: existingExport.size,
      generatedAt: existingExport.generatedAt,
    });
  }

  const cards = await db
    .collection("cards")
    .find({gameId: new ObjectId(game.id)}, {projection: {_id: 0}})
    .toArray();

  const erratasCount = await countErratasByGameId(game.id);
  const erratas = erratasCount > 0
    ? await getErratasByGameId({gameId: game.id, offset: 0, limit: erratasCount})
    : [];

  const policiesCount = await countAllPolicies({gameId: game.id});
  const policies = policiesCount > 0
    ? await getAllPolicies({gameId: game.id, offset: 0, limit: policiesCount})
    : [];

  const generatedAt = new Date();

  const payload = {
    game: {id: game.id, slug: game.slug, name: game.name},
    generatedAt: generatedAt.toISOString(),
    cards,
    erratas,
    policies,
    rules: getRulesExport(game.slug),
  };

  const json = JSON.stringify(payload);
  const size = Buffer.byteLength(json);

  const blob = await put(`exports/${game.slug ?? game.id}/${generatedAt.getTime()}.json`, json, {
    access: 'public',
    contentType: 'application/json',
  });

  const gameExport = await createGameExport({
    gameId: game.id,
    url: blob.url,
    pathname: blob.pathname,
    size,
    generatedAt,
  });

  return NextResponse.json({
    url: gameExport.url,
    size: gameExport.size,
    generatedAt: gameExport.generatedAt,
  });
}
