import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/mongodb";
import { getRawEntries } from "@/lib/rules/riftbound";

/**
 * Un résultat, tel que la palette du site le lit — et tel qu'un client tiers
 * le lit aussi.
 *
 * `href` est le chemin **du site** : la palette s'en sert tel quel. Un autre
 * client (l'application mobile) a ses propres routes et ne peut pas deviner
 * d'un chemin ce qu'il désigne — d'où `kind` et `id`, qui disent la nature du
 * résultat et ce qu'il faut pour l'ouvrir. Les deux voyagent ensemble : le
 * premier reste pour le site, les seconds pour tout le reste.
 */
export type SearchResultKind = "game" | "card" | "lair" | "event" | "policy" | "rule";

export type SearchResult = {
  label: string;
  sublabel?: string;
  href: string;
  image?: string;
  kind: SearchResultKind;
  /** L'identifiant du résultat : celui qu'accepte l'API pour l'ouvrir. */
  id: string;
  /** Le jeu qui porte le résultat, pour les cartes, politiques et règles. */
  gameSlug?: string;
  /** Le document d'une règle Riftbound : règles complètes ou de tournoi. */
  doc?: "CR" | "TR";
};

export type SearchResponse = {
  games: SearchResult[];
  cards: SearchResult[];
  lairs: SearchResult[];
  events: SearchResult[];
  rules: SearchResult[];
};

const LIMIT = 5;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchGames(regex: { $regex: string; $options: string }): Promise<SearchResult[]> {
  const games = await db
    .collection("games")
    .find({ name: regex }, { projection: { name: 1, slug: 1, type: 1 } })
    .limit(LIMIT)
    .toArray();
  return games.map((game) => ({
    label: game.name as string,
    sublabel: game.type as string | undefined,
    href: `/games/${game.slug ?? game._id.toString()}`,
    kind: "game" as const,
    id: game._id.toString(),
    gameSlug: (game.slug as string | undefined) ?? game._id.toString(),
  }));
}

async function searchCards(regex: { $regex: string; $options: string }): Promise<SearchResult[]> {
  // Une carte par nom et par jeu (les impressions multiples sont dédupliquées),
  // avec le slug du jeu pour construire le lien.
  const cards = await db
    .collection("cards")
    .aggregate([
      { $match: { name: regex } },
      { $sort: { name: 1, setCode: 1, collectorNumber: 1 } },
      {
        $group: {
          _id: { name: "$name", gameId: "$gameId" },
          cardId: { $first: "$id" },
          image: { $first: "$image" },
          setCode: { $first: "$setCode" },
        },
      },
      { $limit: LIMIT },
      {
        $lookup: {
          from: "games",
          localField: "_id.gameId",
          foreignField: "_id",
          as: "game",
          pipeline: [{ $project: { name: 1, slug: 1 } }],
        },
      },
      { $addFields: { game: { $arrayElemAt: ["$game", 0] } } },
      { $match: { game: { $ne: null } } },
    ])
    .toArray();
  return cards.map((card) => ({
    label: card._id.name as string,
    sublabel: card.game.name as string,
    href: `/games/${card.game.slug ?? card.game._id.toString()}/cards/${card.cardId}`,
    image: card.image as string | undefined,
    kind: "card" as const,
    id: card.cardId as string,
    gameSlug: (card.game.slug as string | undefined) ?? card.game._id.toString(),
  }));
}

async function searchLairs(
  regex: { $regex: string; $options: string },
  userId?: string
): Promise<SearchResult[]> {
  // Même règle de visibilité que le listing des lieux : publics pour tous,
  // privés uniquement pour leurs propriétaires.
  const visibility = userId
    ? { $or: [{ isPrivate: { $ne: true } }, { isPrivate: true, owners: userId }] }
    : { isPrivate: { $ne: true } };
  const lairs = await db
    .collection("lairs")
    .find({ $and: [{ name: regex }, visibility] }, { projection: { name: 1, address: 1 } })
    .limit(LIMIT)
    .toArray();
  return lairs.map((lair) => ({
    label: lair.name as string,
    sublabel: lair.address as string | undefined,
    href: `/lairs/${lair._id.toString()}`,
    kind: "lair" as const,
    id: lair._id.toString(),
  }));
}

async function searchEvents(regex: { $regex: string; $options: string }): Promise<SearchResult[]> {
  // Événements à venir en priorité ; les événements passés ne sont proposés
  // que si rien d'à venir ne correspond.
  const nowIso = new Date().toISOString();
  const collection = db.collection("events");
  const projection = { id: 1, name: 1, gameName: 1, startDateTime: 1 };

  let events = await collection
    .find({ name: regex, startDateTime: { $gte: nowIso } }, { projection })
    .sort({ startDateTime: 1 })
    .limit(LIMIT)
    .toArray();
  if (events.length === 0) {
    events = await collection
      .find({ name: regex }, { projection })
      .sort({ startDateTime: -1 })
      .limit(LIMIT)
      .toArray();
  }

  return events.map((event) => {
    const date = new Date(event.startDateTime as string);
    const dateText = Number.isNaN(date.getTime())
      ? undefined
      : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const id = (event.id as string | undefined) ?? event._id.toString();
    return {
      label: event.name as string,
      sublabel: [event.gameName, dateText].filter(Boolean).join(" — ") || undefined,
      href: `/events/${id}`,
      kind: "event" as const,
      id,
    };
  });
}

async function searchPolicies(query: string): Promise<SearchResult[]> {
  // Les policies portent un index texte (voir lib/db/policies.ts) ; la
  // recherche plein-texte est tentée d'abord, avec repli sur le titre si
  // l'index venait à manquer.
  type PolicyRow = { _id: ObjectId; title?: string; gameId?: ObjectId };
  let policies: PolicyRow[] = [];
  try {
    policies = await db
      .collection<PolicyRow>("policies")
      .find({ $text: { $search: query } }, { projection: { _id: 1, title: 1, gameId: 1, score: { $meta: "textScore" } } })
      .sort({ score: { $meta: "textScore" } })
      .limit(LIMIT)
      .toArray();
  } catch {
    policies = await db
      .collection<PolicyRow>("policies")
      .find({ title: { $regex: escapeRegex(query), $options: "i" } }, { projection: { _id: 1, title: 1, gameId: 1 } })
      .limit(LIMIT)
      .toArray();
  }
  if (policies.length === 0) return [];

  const gameIds = [...new Set(policies.map((p) => p.gameId?.toString()).filter(Boolean))] as string[];
  const games = await db
    .collection("games")
    .find({ _id: { $in: gameIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1, slug: 1 } })
    .toArray();
  const gamesById = new Map(games.map((g) => [g._id.toString(), g]));

  return policies.flatMap((policy) => {
    const game = policy.gameId ? gamesById.get(policy.gameId.toString()) : undefined;
    if (!game || !policy.title) return [];
    const gameSlug = (game.slug as string | undefined) ?? game._id.toString();
    return [{
      label: policy.title,
      sublabel: game.name as string,
      href: `/games/${gameSlug}/policies`,
      kind: "policy" as const,
      id: policy._id.toString(),
      gameSlug,
    }];
  });
}

function searchRiftboundRules(query: string): SearchResult[] {
  // Règles complètes (CR) et de tournoi (TR) Riftbound, chargées depuis les
  // fichiers embarqués : recherche par inclusion sur le contenu ou l'id.
  const lowered = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const doc of ["CR", "TR"] as const) {
    const entries = getRawEntries(doc, "en");
    for (const entry of entries) {
      if (results.length >= LIMIT) break;
      if (entry.content.toLowerCase().includes(lowered) || entry.id.toLowerCase() === lowered) {
        results.push({
          label: `${doc} ${entry.id}`,
          sublabel: entry.content.length > 90 ? `${entry.content.slice(0, 90)}…` : entry.content,
          href: `/games/riftbound/rules/${doc.toLowerCase()}`,
          kind: "rule" as const,
          id: entry.id,
          gameSlug: "riftbound",
          doc,
        });
      }
    }
    if (results.length >= LIMIT) break;
  }
  return results;
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ games: [], cards: [], lairs: [], events: [], rules: [] } satisfies SearchResponse);
  }

  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const regex = { $regex: escapeRegex(query), $options: "i" };

  try {
    const [games, cards, lairs, events, policies] = await Promise.all([
      searchGames(regex),
      searchCards(regex),
      searchLairs(regex, session?.user?.id),
      searchEvents(regex),
      searchPolicies(query),
    ]);
    const rules = [...policies, ...searchRiftboundRules(query)].slice(0, LIMIT);

    return NextResponse.json({ games, cards, lairs, events, rules } satisfies SearchResponse);
  } catch (error) {
    console.error("Erreur lors de la recherche globale:", error);
    return NextResponse.json({ error: "Erreur lors de la recherche" }, { status: 500 });
  }
}
