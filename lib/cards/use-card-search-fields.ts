"use client";

import { useEffect, useState } from "react";
import type { CardFilterFacet } from "@/lib/cards/search-filters";
import { buildSearchFields, type SearchField } from "@/lib/cards/search-syntax";

type FieldsPayload = {
  facets?: CardFilterFacet[];
  setCodes?: string[];
  types?: string[];
  languages?: string[];
};

/** Un seul appel par jeu et par page : plusieurs barres d'un même écran le partagent. */
const cache = new Map<string, Promise<SearchField[]>>();

function loadFields(gameSlug: string): Promise<SearchField[]> {
  let pending = cache.get(gameSlug);
  if (!pending) {
    // Une recherche d'une carte suffit : la réponse paginée porte les facettes
    // et les listes du jeu, celles d'où la syntaxe tire son vocabulaire.
    pending = fetch(`/api/games/${encodeURIComponent(gameSlug)}/cards?page=1&limit=1&setCode=*&lang=all`)
      .then((response) => (response.ok ? (response.json() as Promise<FieldsPayload>) : {}))
      .then((data: FieldsPayload) =>
        buildSearchFields(data.facets ?? [], {
          setCodes: data.setCodes ?? [],
          types: data.types ?? [],
          languages: data.languages ?? [],
        })
      )
      .catch(() => {
        cache.delete(gameSlug);
        return [];
      });
    cache.set(gameSlug, pending);
  }
  return pending;
}

/**
 * Le vocabulaire de la barre de recherche de cartes d'un jeu (`domain:fury`,
 * `energy<=3`, `set:OGN`…), pour les écrans qui n'ont pas déjà les facettes
 * sous la main. Vide tant qu'il n'est pas arrivé : la saisie fonctionne quand
 * même, l'API relisant elle-même les tokens ; seules les suggestions attendent.
 */
export function useCardSearchFields(gameSlug: string | undefined): SearchField[] {
  const [fields, setFields] = useState<SearchField[]>([]);
  useEffect(() => {
    if (!gameSlug) return;
    let cancelled = false;
    void loadFields(gameSlug).then((next) => !cancelled && setFields(next));
    return () => {
      cancelled = true;
    };
  }, [gameSlug]);
  return fields;
}
