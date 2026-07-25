import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/mongodb";
import { getRawEntries } from "@/lib/rules/riftbound";

export type SearchResult = {
  label: string;
  sublabel?: string;
  href: string;
  image?: string;
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
    return {
      label: event.name as string,
      sublabel: [event.gameName, dateText].filter(Boolean).join(" — ") || undefined,
      href: `/events/${event.id ?? event._id.toString()}`,
    };
  });
}

async function searchPolicies(query: string): Promise<SearchResult[]> {
  // Les policies portent un index texte (voir lib/db/policies.ts) ; la
  // recherche plein-texte est tentée d'abord, avec repli sur le titre si
  // l'index venait à manquer.
  type PolicyRow = { title?: string; gameId?: ObjectId };
  let policies: PolicyRow[] = [];
  try {
    policies = await db
      .collection<PolicyRow>("policies")
      .find({ $text: { $search: query } }, { projection: { title: 1, gameId: 1, score: { $meta: "textScore" } } })
      .sort({ score: { $meta: "textScore" } })
      .limit(LIMIT)
      .toArray();
  } catch {
    policies = await db
      .collection<PolicyRow>("policies")
      .find({ title: { $regex: escapeRegex(query), $options: "i" } }, { projection: { title: 1, gameId: 1 } })
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
    return [{
      label: policy.title,
      sublabel: game.name as string,
      href: `/games/${game.slug ?? game._id.toString()}/policies`,
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
