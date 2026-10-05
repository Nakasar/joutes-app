import { useEffect, useRef } from "react";

/**
 * Recopie l'état d'une recherche dans l'adresse, sans naviguer.
 *
 * `history.replaceState` plutôt que `router.replace` : Next s'y synchronise
 * (`useSearchParams` suit), mais rien n'est redemandé au serveur — la page a
 * déjà ses résultats. Et c'est un remplacement, pas une entrée de plus : le
 * bouton retour ramène à la page précédente, pas au filtre précédent.
 *
 * Le chemin est celui que le navigateur affichait au montage (préfixe de langue
 * compris, ou non). Si l'adresse en a changé depuis, l'écriture est ignorée :
 * un délai de saisie qui expire pendant une navigation ne doit pas réécrire la
 * page suivante avec les paramètres de celle qu'on quitte.
 */
export function useUrlQuerySync(params: URLSearchParams): void {
  const pathnameRef = useRef<string | null>(null);
  const query = params.toString();

  useEffect(() => {
    pathnameRef.current ??= window.location.pathname;
    const pathname = pathnameRef.current;
    if (window.location.pathname !== pathname) return;

    const search = query ? `?${query}` : "";
    if (window.location.search === search) return;

    window.history.replaceState(null, "", `${pathname}${search}${window.location.hash}`);
  }, [query]);
}
