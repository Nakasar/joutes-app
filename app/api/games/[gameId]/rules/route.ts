import {NextRequest, NextResponse} from "next/server";
import db from "@/lib/mongodb";
import cr from '@/data/riftbound/cr.json';
import tr from '@/data/riftbound/tr.json';
import {Game} from "@/lib/types/Game";

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await db.collection<Game>('games').findOne({ slug: gameId });
  if (!game) {
    return NextResponse.json({ error: "game does not exist" }, { status: 404 });
  }

  if (game.slug !== 'riftbound') {
    return NextResponse.json({ error: "game has no supported rules" }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const document = searchParams.get('document') || undefined;

  if (!document) {
    return NextResponse.json({ error: "missing source document in query" }, { status: 400 });
  }

  if (!['TR', 'CR'].includes(document)) {
    return NextResponse.json({ error: `allowed document sources in query for ${game.name}: TR, CR` });
  }

  if (document === 'TR') {
    return NextResponse.json(tr);
  } else if (document === 'CR') {
    return NextResponse.json(cr);
  }
}
