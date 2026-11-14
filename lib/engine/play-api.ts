import "server-only";

import { NextResponse, type NextRequest } from "next/server";

/**
 * Les pages Jouer passent par des actions serveur, que seul le site peut
 * appeler. L'app mobile en a besoin aussi : ces routes REST les exposent telles
 * quelles, un jeu par route attrape-tout (`app/api/games/<jeu>/play/[...path]`).
 *
 * - `GET  lobby` : decks jouables, mes tables, decks automatiques ;
 * - `GET  decks?q=` : decks publics pendant la frappe ;
 * - `POST decks/resolve` `{ reference }` : le deck d'un invité en mode hôte ;
 * - `POST tables` `{ mode?, choice }` : créer une table en ligne ;
 * - `GET  tables/{id}` : l'état de la table, avec mon entrée à la partie ;
 * - `POST tables/{id}/join` `{ choice }`, `bots` `{ level }`, `leave` `{ seat, name }`, `start`.
 *
 * Les réponses gardent la forme des actions (`{ ok, … }` ou `{ ok: false, error }`)
 * pour que l'app et le site lisent les mêmes codes d'échec.
 */

type Result = { ok: boolean; error?: string };

export type PlayApi = {
  lobby: () => Promise<Result>;
  searchDecks: (query: unknown) => Promise<Result>;
  resolveDeck: (reference: unknown) => Promise<Result>;
  createTable: (mode: unknown, choice: unknown) => Promise<Result>;
  readTable: (id: unknown) => Promise<Result>;
  joinTable: (id: unknown, choice: unknown) => Promise<Result>;
  addBot: (id: unknown, level: unknown) => Promise<Result>;
  leaveSeat: (id: unknown, seat: unknown, name: unknown) => Promise<Result>;
  startTable: (id: unknown) => Promise<Result>;
};

type Context = { params: Promise<{ path?: string[] }> };

const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  // Réservé à un abonnement : l'app propose l'offre plutôt qu'une erreur.
  SUBSCRIPTION: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  INVALID_DECK: 400,
  OFFLINE: 503,
  SERVER: 500,
};

function reply(result: Result): NextResponse {
  if (result.ok) return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  // Un échec sans code (lobby SWU) : le jeu n'est pas ouvert ou le serveur a échoué.
  const error = result.error ?? "NOT_FOUND";
  return NextResponse.json({ ...result, error }, { status: STATUS[error] ?? 409 });
}

const notFound = () => NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

async function body(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function playRoutes(api: PlayApi) {
  async function GET(request: NextRequest, context: Context) {
    const path = (await context.params).path ?? [];
    if (path.length === 1 && path[0] === "lobby") return reply(await api.lobby());
    if (path.length === 1 && path[0] === "decks") {
      return reply(await api.searchDecks(request.nextUrl.searchParams.get("q") ?? ""));
    }
    if (path.length === 2 && path[0] === "tables") return reply(await api.readTable(path[1]));
    return notFound();
  }

  async function POST(request: NextRequest, context: Context) {
    const path = (await context.params).path ?? [];
    const input = await body(request);
    if (path.join("/") === "decks/resolve") return reply(await api.resolveDeck(input.reference));
    if (path.length === 1 && path[0] === "tables") return reply(await api.createTable(input.mode, input.choice));
    if (path.length === 3 && path[0] === "tables") {
      const id = path[1];
      switch (path[2]) {
        case "join":
          return reply(await api.joinTable(id, input.choice));
        case "bots":
          return reply(await api.addBot(id, input.level));
        case "leave":
          return reply(await api.leaveSeat(id, input.seat, input.name));
        case "start":
          return reply(await api.startTable(id));
      }
    }
    return notFound();
  }

  return { GET, POST };
}
