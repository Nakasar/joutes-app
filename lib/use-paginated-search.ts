import { useMemo, useState } from "react";

export type PaginatedSearch<T> = {
  query: string;
  setQuery: (value: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageItems: T[];
  totalPages: number;
  total: number;
  pageSize: number;
};

/**
 * Recherche textuelle + pagination côté client sur une liste. `toText` fournit
 * le texte recherchable d'un élément. La page courante est bornée au nombre de
 * pages résultant du filtre, et la recherche remet à la première page.
 */
export function usePaginatedSearch<T>(
  items: T[],
  toText: (item: T) => string,
  pageSize = 25
): PaginatedSearch<T> {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // Borne la taille de page à au moins 1 pour éviter une division par 0.
  const size = Math.max(1, Math.floor(pageSize));

  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (normalized ? items.filter((item) => toText(item).toLowerCase().includes(normalized)) : items),
    [items, normalized, toText]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageItems = filtered.slice(currentPage * size, currentPage * size + size);

  return {
    query,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(0);
    },
    page: currentPage,
    setPage,
    pageItems,
    totalPages,
    total: filtered.length,
    pageSize: size,
  };
}
