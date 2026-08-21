"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation.ts";
import type { GameCardSummary } from "@/lib/db/cards.ts";
import { searchCards } from "./actions.ts";
import CardOriginBadges from "./CardOriginBadges.tsx";
import CardImage from "@/components/cards/CardImage.tsx";

type Props = {
  gameId: string;
  selectedCardId?: string;
  /** Dernières cartes ajoutées, affichées tant qu'aucune recherche n'est saisie. */
  recentCards: GameCardSummary[];
};

const MIN_QUERY_LENGTH = 2;

function CardRow({
  card,
  gameId,
  selected,
}: {
  card: GameCardSummary;
  gameId: string;
  selected: boolean;
}) {
  // Référence de la carte, « #SFD-125 ». Les deux champs étant facultatifs,
  // seuls ceux qui sont renseignés sont joints : jamais de tiret orphelin.
  const reference = [card.setCode, card.collectorNumber].filter(Boolean).join("-");

  const content = (
    <>
      {card.image ? (
        <CardImage
          src={card.image}
          alt=""
          orientation={card.orientation}
          frame="10/14"
          loading="lazy"
          className="h-14 w-10 flex-shrink-0 rounded border object-cover"
        />
      ) : (
        <span className="h-14 w-10 flex-shrink-0 rounded border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{card.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{card.id}</span>
          {reference ? ` · #${reference}` : ""}
          {card.lang ? ` · ${card.lang.toUpperCase()}` : ""}
        </p>
        <CardOriginBadges card={card} />
      </div>
    </>
  );

  if (selected) {
    return (
      <li className="flex items-center gap-3 rounded-lg border border-blue-500 bg-blue-500/5 p-2 text-sm">
        {content}
        <span className="flex-shrink-0 text-xs text-muted-foreground">En cours de modification</span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/admin/cards?gameId=${gameId}&cardId=${encodeURIComponent(card.id)}`}
        className="flex items-center gap-3 rounded-lg border border-transparent p-2 text-sm hover:border-input hover:bg-muted/50"
      >
        {content}
        <span className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400">Modifier</span>
      </Link>
    </li>
  );
}

/**
 * Choix de la carte à modifier. Le champ de recherche et les dernières cartes
 * ajoutées partagent la même liste : tant que rien n'est saisi, on propose les
 * ajouts récents, ce qui couvre le cas courant (reprendre la carte qu'on vient
 * de créer) sans occuper deux blocs distincts.
 */
export default function CardBrowser({ gameId, selectedCardId, recentCards }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameCardSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const sequence = useRef(0);

  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    const current = ++sequence.current;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const cards = await searchCards(gameId, trimmed);
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
  }, [gameId, trimmed]);

  const shown = isSearching ? results : recentCards;

  return (
    <div className="bg-card rounded-lg shadow-md p-6 space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="card-browser-search">
          Modifier une carte existante
        </label>
        <input
          id="card-browser-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Identifiant, nom ou numéro de collection…"
          className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {isSearching
          ? searching
            ? "Recherche…"
            : `${results.length} résultat${results.length === 1 ? "" : "s"}`
          : "Dernières cartes ajoutées"}
      </p>

      {isSearching && !searching && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune carte ne correspond.</p>
      )}
      {!isSearching && recentCards.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune carte pour ce jeu pour l&apos;instant.</p>
      )}

      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((card) => (
            <CardRow key={card.id} card={card} gameId={gameId} selected={card.id === selectedCardId} />
          ))}
        </ul>
      )}
    </div>
  );
}
