"use client";

import { useEffect, useState } from "react";

import type { SwuTableCards } from "@/lib/engine/swu/cards";
import { SWU_ENGINE_VERSION } from "@/lib/engine/swu/version";

/** Change quand la forme des cartes change : elle entre dans l'adresse, gardée une heure par le navigateur. */
const SWU_TABLE_CARDS_SHAPE = 1;

let shared: Promise<SwuTableCards> | undefined;

function fetchCards(): Promise<SwuTableCards> {
  shared ??= fetch(`/api/games/swu/play/cards?v=${SWU_ENGINE_VERSION}.${SWU_TABLE_CARDS_SHAPE}`).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<SwuTableCards>;
  });
  shared.catch(() => {
    shared = undefined;
  });
  return shared;
}

const EMPTY: SwuTableCards = {};

/** Les cartes de la table SWU. Vide tant qu'elles ne sont pas arrivées : la table se joue avec les noms du moteur. */
export function useSwuTableCards(): SwuTableCards {
  const [cards, setCards] = useState<SwuTableCards>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    fetchCards()
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
