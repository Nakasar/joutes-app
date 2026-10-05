/**
 * Y a-t-il, derrière la page courante, une page de l'app où revenir ?
 *
 * C'est ce qui permet à un bouton « retour » de ramener là d'où l'on vient — la
 * page d'accueil si le deck a été ouvert depuis l'accueil — plutôt que vers une
 * page parente fixée d'avance. Sans page de l'app derrière soi (lien ouvert
 * depuis l'extérieur, nouvel onglet), le bouton garde sa destination fixe : un
 * retour d'historique ferait quitter le site.
 *
 * La Navigation API répond exactement : ses entrées ne comptent que celles de
 * même origine. Là où elle manque, les navigations de l'app sont comptées à la
 * main (`recordNavigation`), au mieux : un `popstate` est pris pour un retour.
 */

type NavigationLike = {
  currentEntry: { index: number } | null;
  addEventListener(type: "currententrychange", listener: () => void): void;
  removeEventListener(type: "currententrychange", listener: () => void): void;
};

function navigationApi(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
  return navigation?.currentEntry ? navigation : null;
}

let depth = 0;
let lastWasPop = false;
let tracking = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** À appeler à chaque changement de page de l'app (voir `InAppHistoryTracker`). */
export function recordNavigation(): void {
  if (!tracking) {
    // La première page de l'onglet : rien derrière elle, du point de vue de l'app.
    tracking = true;
    window.addEventListener("popstate", () => {
      lastWasPop = true;
    });
    return;
  }

  depth = lastWasPop ? Math.max(0, depth - 1) : depth + 1;
  lastWasPop = false;
  notify();
}

export function canGoBackInApp(): boolean {
  const navigation = navigationApi();
  if (navigation) return (navigation.currentEntry?.index ?? 0) > 0;
  return depth > 0;
}

/** Abonnement pour `useSyncExternalStore`. */
export function subscribeInAppHistory(listener: () => void): () => void {
  listeners.add(listener);
  const navigation = navigationApi();
  navigation?.addEventListener("currententrychange", listener);
  return () => {
    listeners.delete(listener);
    navigation?.removeEventListener("currententrychange", listener);
  };
}
