import { useCallback, useEffect, useState } from "react";

/**
 * Synchronise l'onglet sélectionné avec un paramètre de l'URL, pour obtenir un
 * lien direct vers la bonne section (ex: `?tab=players`). Lit la valeur au
 * montage (évite les incohérences d'hydratation) et met à jour l'URL sans
 * navigation via history.replaceState.
 */
export function useTabParam(
  paramName: string,
  defaultValue: string,
  validValues: readonly string[]
): readonly [string, (value: string) => void] {
  const [tab, setTabState] = useState(defaultValue);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(paramName);
    if (value && validValues.includes(value)) setTabState(value);
    // Lecture unique au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = useCallback(
    (value: string) => {
      if (!validValues.includes(value)) return;
      setTabState(value);
      const params = new URLSearchParams(window.location.search);
      params.set(paramName, value);
      const query = params.toString();
      // Préserve un éventuel fragment (#ancre) de l'URL.
      const hash = window.location.hash;
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${hash}`
      );
    },
    [paramName, validValues]
  );

  return [tab, setTab] as const;
}
