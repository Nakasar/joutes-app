import {NextRequest, NextResponse} from "next/server";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";
import {getHyperlinkedEntries, searchRuleEntries, RuleDocument, RuleLang} from "@/lib/rules/riftbound";

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
  const langRaw = searchParams.get('lang') ?? 'en';
  const ruleId = searchParams.get('ruleId') ?? undefined;
  const searchQuery = searchParams.get('searchQuery') ?? undefined;
  const limitRaw = searchParams.get('limit') ?? undefined;

  if (langRaw !== 'en' && langRaw !== 'fr') {
    return NextResponse.json({ error: `allowed lang in query for ${game.name}: en, fr` }, { status: 400 });
  }
  const lang = langRaw as RuleLang;

  const document = documentRaw ? documentRaw.toUpperCase() : undefined;
  if (document && !['TR', 'CR'].includes(document)) {
    return NextResponse.json({ error: `allowed document sources in query for ${game.name}: TR, CR` }, { status: 400 });
  }

  if (searchQuery) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const results = searchRuleEntries({
      document: document as RuleDocument | undefined,
      lang,
      query: searchQuery,
      limit: limit && !isNaN(limit) ? limit : undefined,
    });
    return NextResponse.json(results);
  }

  if (!document) {
    return NextResponse.json({ error: "missing source document in query" }, { status: 400 });
  }

  const entries = getHyperlinkedEntries(document as RuleDocument, lang);

  if (ruleId) {
    const rule = entries.find(r => r.id === ruleId);
    if (!rule) {
      return NextResponse.json({ error: `rule ${ruleId} not found in ${document} for ${game.name}` }, { status: 404 });
    }
    return NextResponse.json([rule]);
  }

  return NextResponse.json(entries);
}
