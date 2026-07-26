"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameCardSummary } from "@/lib/db/cards";
import { searchCards } from "./actions";
import CardOriginBadges from "./CardOriginBadges";

type Props = {
  gameId: string;
  selectedCardId?: string;
};

export default function CardSearch({ gameId, selectedCardId }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameCardSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const current = ++sequence.current;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const cards = await searchCards(gameId, query);
        if (current === sequence.current) {
          setResults(cards);
        }
      } catch {
        if (current === sequence.current) {
          setResults([]);
        }
      } finally {
        if (current === sequence.current) {
          setSearching(false);
        }
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [gameId, query]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Modifier une carte existante</label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Identifiant, nom ou numéro de collection…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {searching && <p className="text-sm text-gray-500">Recherche…</p>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-gray-500">Aucune carte ne correspond.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {results.map((card) => (
            <li key={card.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-gray-900">{card.name}</span>
                <span className="ml-2 font-mono text-xs text-gray-500">{card.id}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {card.setCode} #{card.collectorNumber}
                  {card.lang ? ` · ${card.lang.toUpperCase()}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CardOriginBadges card={card} />
                {card.id === selectedCardId ? (
                  <span className="text-xs text-gray-500">En cours de modification</span>
                ) : (
                  <Link
                    href={`/admin/cards?gameId=${gameId}&cardId=${encodeURIComponent(card.id)}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Modifier
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
