"use client";

import { useEffect, useState } from "react";

import type { TableCards } from "@/lib/engine/cards";

let shared: Promise<TableCards> | undefined;

function fetchTableCards(): Promise<TableCards> {
  shared ??= fetch("/api/games/riftbound/play/cards").then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<TableCards>;
  });
  shared.catch(() => {
    shared = undefined;
  });
  return shared;
}

/**
 * Les cartes de la table (nom, illustration, texte). Vide tant qu'elles ne sont
 * pas arrivées : la table se joue quand même, avec les noms du moteur.
 */
export function useTableCards(): TableCards {
  const [cards, setCards] = useState<TableCards>({});
  useEffect(() => {
    let cancelled = false;
    fetchTableCards()
      .then((loaded) => {
        if (!cancelled) setCards(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return cards;
}
