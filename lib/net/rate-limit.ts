import "server-only";

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import db from "@/lib/mongodb";
import { clientAddress } from "@/lib/net/client-address";

export { clientAddress };

/**
 * Limites de débit hors de la connexion.
 *
 * better-auth limite déjà ses propres routes (codes par e-mail, connexion).
 * Rien ne limitait le reste : des routes publiques qui calculent pour de bon
 * (recherche, repérage de cartes dans un texte, vérification de deck) et des
 * actions qui écrivent (signalements, demandes d'ami) pouvaient être appelées
 * en boucle par un script.
 *
 * Un compteur par clé et par fenêtre, dans MongoDB comme celui de better-auth :
 * les instances de fonction ne partagent pas de mémoire. Les documents
 * s'effacent seuls (index TTL sur `expiresAt`, déclaré dans
 * `lib/db/indexes/platform.ts`). Si la base ne répond pas, la limite laisse
 * passer : elle protège le service, elle ne doit pas le couper.
 */

export const RATE_LIMIT_COLLECTION = "rateLimits";

export type RateLimitRule = {
  /** Ce qui est limité, dans la clé du compteur (`search`, `report`…). */
  name: string;
  /** Appels admis par fenêtre. */
  max: number;
  /** Durée de la fenêtre, en secondes. */
  windowSeconds: number;
};

type Counter = { _id: string; count: number; expiresAt: Date };

/** La fenêtre courante : toutes les requêtes d'une même fenêtre partagent ce numéro. */
export function rateLimitSlot(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / (windowSeconds * 1000));
}

/** La clé d'un appelant : son adresse n'est jamais écrite en clair en base. */
export function rateLimitKey(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 32);
}

/**
 * Compte un appel et dit s'il dépasse la limite. `subject` est ce qu'on
 * limite : une adresse (`ip:…`) ou un compte (`user:…`).
 */
export async function isRateLimited(rule: RateLimitRule, subject: string, nowMs: number = Date.now()): Promise<boolean> {
  const slot = rateLimitSlot(nowMs, rule.windowSeconds);
  const id = `${rule.name}:${rateLimitKey(subject)}:${slot}`;

  try {
    const counter = await db.collection<Counter>(RATE_LIMIT_COLLECTION).findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        // Gardé une fenêtre de plus que nécessaire, puis effacé par l'index TTL.
        $setOnInsert: { expiresAt: new Date((slot + 2) * rule.windowSeconds * 1000) },
      },
      { upsert: true, returnDocument: "after" },
    );
    return (counter?.count ?? 0) > rule.max;
  } catch (error) {
    console.error(`Limite de débit « ${rule.name} » illisible, appel admis :`, error);
    return false;
  }
}

/**
 * Pour une route : la réponse 429 si l'appelant dépasse la limite, sinon
 * `null`. La limite porte sur l'adresse, ou sur `subject` quand la route
 * connaît le compte.
 */
export async function rateLimitResponse(
  request: Request,
  rule: RateLimitRule,
  subject?: string,
): Promise<NextResponse | null> {
  const limited = await isRateLimited(rule, subject ?? `ip:${clientAddress(request.headers)}`);
  if (!limited) return null;

  return NextResponse.json(
    { error: { message: "Too many requests. Please retry later.", code: "RATE_LIMITED" } },
    { status: 429, headers: { "Retry-After": String(rule.windowSeconds) } },
  );
}

/**
 * Les limites en vigueur. Par adresse, elles restent larges : une boutique ou
 * un tournoi met des dizaines de joueurs derrière la même adresse.
 */
export const RATE_LIMITS = {
  search: { name: "search", max: 180, windowSeconds: 60 },
  cards: { name: "cards", max: 300, windowSeconds: 60 },
  loop: { name: "loop", max: 20, windowSeconds: 60 },
  deckChecker: { name: "deck-checker", max: 30, windowSeconds: 60 },
  scannerMatch: { name: "scanner-match", max: 300, windowSeconds: 60 },
  /** Le scan par IA appelle un modèle payant : plafond par compte et par jour. */
  scannerAiDaily: { name: "scanner-ai-day", max: 300, windowSeconds: 86_400 },
  /** Par compte. */
  report: { name: "report", max: 10, windowSeconds: 3_600 },
  friendRequest: { name: "friend-request", max: 30, windowSeconds: 3_600 },
} as const satisfies Record<string, RateLimitRule>;
