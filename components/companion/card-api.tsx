"use client";

import type { ReactNode } from "react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation";
import type { CompanionGame } from "@/lib/companion/state";

/*
 * Ce que la loupe du compagnon lit d'une carte, et le lien vers sa fiche.
 * L'app mobile a son propre fichier du même nom : le reste de la loupe est
 * recopié tel quel.
 */

export type LookupErrata = {
  id: string;
  type: "errata" | "clarification" | "ruling";
  details: string;
  translations?: { lang: string; details: string }[];
  source?: string;
  errataDate?: string;
  deprecatedAt?: string | null;
};

export type LookupCard = {
  id: string;
  name: string;
  image?: string;
  orientation?: "portrait" | "landscape";
  erratas: LookupErrata[];
};

/** La fiche d'une carte et ses erratas, clarifications et rulings. */
export async function fetchLookupCard(game: CompanionGame, cardId: string): Promise<LookupCard> {
  const res = await fetch(`/api/games/${game}/cards/${encodeURIComponent(cardId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Partial<LookupCard>;
  return {
    id: data.id ?? cardId,
    name: data.name ?? "",
    ...(data.image ? { image: data.image } : {}),
    ...(data.orientation ? { orientation: data.orientation } : {}),
    erratas: data.erratas ?? [],
  };
}

export function formatErrataDate(value: string, locale: string): string {
  const date = DateTime.fromISO(value);
  return date.isValid ? date.setLocale(locale).toLocaleString(DateTime.DATE_MED) : value;
}

/** Vers la fiche complète de la carte ; la partie reste enregistrée. */
export function CardPageLink({ game, cardId, className, children }: { game: CompanionGame; cardId: string; className?: string; children: ReactNode }) {
  return (
    <Link href={`/games/${game}/cards/${encodeURIComponent(cardId)}`} className={className}>
      {children}
    </Link>
  );
}
