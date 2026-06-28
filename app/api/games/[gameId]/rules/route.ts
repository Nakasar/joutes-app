import {NextRequest, NextResponse} from "next/server";
import db from "@/lib/mongodb";
import cr from '@/data/riftbound/cr.json';
import tr from '@/data/riftbound/tr.json';
import fr_cr from '@/data/riftbound/fr/cr.json';
import fr_tr from '@/data/riftbound/fr/tr.json';
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
  const documentRaw = searchParams.get('document') ?? undefined;
  const lang = searchParams.get('lang') ?? 'en';
  const ruleId = searchParams.get('ruleId') ?? undefined;

  if (!documentRaw) {
    return NextResponse.json({ error: "missing source document in query" }, { status: 400 });
  }

  const document = documentRaw.toUpperCase();

  if (!['TR', 'CR'].includes(document)) {
    return NextResponse.json({ error: `allowed document sources in query for ${game.name}: TR, CR` });
  }

  if (document === 'TR') {
    if (lang === 'fr') {
      if (ruleId) {
        const rule = fr_tr.find(r => r.id === ruleId);
        return NextResponse.json([rule]);
      }
      return NextResponse.json(fr_tr);
    } else if (lang === 'en') {
      if (ruleId) {
        const rule = tr.find(r => r.id === ruleId);
        return NextResponse.json([rule]);
      }
      return NextResponse.json(tr);
    } else {
      return NextResponse.json({ error: `allowed lang in query for ${document} in ${game.name}: en, fr` });
    }
  } else if (document === 'CR') {
    if (lang === 'fr') {
      if (ruleId) {
        const rule = fr_cr.find(r => r.id === ruleId);
        return NextResponse.json([rule]);
      }
      return NextResponse.json(fr_cr);
    } else if (lang === 'en') {
      if (ruleId) {
        const rule = cr.find(r => r.id === ruleId);
        return NextResponse.json([rule]);
      }
      return NextResponse.json(cr);
    } else {
      return NextResponse.json({ error: `allowed lang in query for ${document} in ${game.name}: en, fr` });
    }
  }
}
