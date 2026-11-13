"use client";

import { useEffect, useState } from "react";

import type { CpTableCards } from "@/lib/engine/cyberpunk/cards";
import { CP_ENGINE_VERSION } from "@/lib/engine/cyberpunk/version";

/** Change quand la forme des cartes change : elle entre dans l'adresse, gardée une heure par le navigateur. */
const CP_TABLE_CARDS_SHAPE = 1;

let shared: Promise<CpTableCards> | undefined;

function fetchCards(): Promise<CpTableCards> {
  shared ??= fetch(`/api/games/cp/play/cards?v=${CP_ENGINE_VERSION}.${CP_TABLE_CARDS_SHAPE}`).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<CpTableCards>;
  });
  shared.catch(() => {
    shared = undefined;
  });
  return shared;
}

const EMPTY: CpTableCards = {};

/** Les cartes de la table Cyberpunk. Vide tant qu'elles ne sont pas arrivées : la table se joue avec les noms du moteur. */
export function useCpTableCards(): CpTableCards {
  const [cards, setCards] = useState<CpTableCards>(EMPTY);
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
