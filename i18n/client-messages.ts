/**
 * Les textes envoyés au navigateur.
 *
 * Un composant client lit ses textes dans le fournisseur le plus proche
 * (`NextIntlClientProvider`), qui les reçoit du serveur dans le HTML de la
 * page. Donner tout le catalogue au fournisseur du layout racine, comme
 * avant, revenait à écrire ~350 Ko de textes dans **chaque** page, l'accueil
 * comme une fiche de carte, pour n'en lire que quelques lignes.
 *
 * Le layout racine ne reçoit donc que les espaces de noms communs ; chaque
 * section du site (`app/[locale]/(app)/<section>/layout.tsx`) y ajoute les
 * siens avec `<ClientMessages section="…">`. Les composants serveur ne sont pas
 * concernés : ils lisent le catalogue sur place.
 *
 * `node scripts/check-client-messages.mjs` suit les imports de chaque section
 * et sort en erreur si un composant client lit un espace de noms absent d'ici
 * (`--print` affiche ce que chaque section lit). Les deux listes restent des
 * littéraux simples : le script les lit sans exécuter ce fichier.
 */

/** Lus par le cadre (en-tête) ou trop petits pour mériter un fournisseur à eux. */
export const SHARED_NAMESPACES = ["Header", "LocaleSwitcher", "Navigation", "Reports", "Location", "Prices", "Printings", "EventHighlights", "EventJoin", "HalloweenSeason", "Login", "AppLogin", "Friends", "SellLists"] as const;

/** Par section : ce que ses composants client lisent en plus du commun. */
export const SECTION_NAMESPACES = {
  account: ["Account", "AccountSubscription", "Lairs"],
  affiches: ["Lairs", "Posters"],
  collection: ["Collection", "Games", "Wishlists"],
  companion: ["Games"],
  cubes: ["Cubes", "Games"],
  decks: ["DeckComments", "Games", "PlayGroups"],
  events: ["EventCreate", "EventDetail", "EventsCalendar", "Tournaments"],
  games: ["Collection", "Cubes", "Games", "Wishlists"],
  lairs: ["EventsCalendar", "Lairs"],
  "play-groups": ["Collection", "DeckComments", "Games", "PlayGroups", "Wishlists"],
  policies: ["Games"],
  t: ["Tournaments"],
  tournaments: ["Tournaments"],
  trade: ["Trade"],
  users: ["Users"],
  wishlists: ["Games", "Wishlists"],
} as const;

export type MessageSection = keyof typeof SECTION_NAMESPACES;

/** Ne garde du catalogue que les espaces de noms demandés. */
export function pickMessages<T extends Record<string, unknown>>(
  messages: T,
  names: readonly string[],
): Partial<T> {
  const picked: Record<string, unknown> = {};
  for (const name of names) {
    if (name in messages) picked[name] = messages[name];
  }
  return picked as Partial<T>;
}

/** Les espaces de noms d'une section, commun compris. */
export function sectionNamespaces(section: MessageSection): string[] {
  return [...new Set<string>([...SHARED_NAMESPACES, ...SECTION_NAMESPACES[section]])];
}
