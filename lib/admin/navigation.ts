/**
 * Le menu de l'administration, rangé par grands usages.
 *
 * Douze onglets à plat débordaient de la barre et ne disaient rien de ce qui
 * attendait une décision : le menu latéral les regroupe, et les entrées qui
 * portent un compteur (`badge`) le reçoivent de la mise en page.
 *
 * L'icône est un nom, pas un composant : ce fichier est lu côté serveur (la
 * palette de recherche) comme côté client (le menu), et le menu fait la
 * correspondance avec `lucide-react`.
 */
export type AdminNavIcon =
  | "home"
  | "flag"
  | "inbox"
  | "dice"
  | "card"
  | "box"
  | "trophy"
  | "users"
  | "pin"
  | "swords"
  | "download"
  | "chat"
  | "sliders";

export type AdminNavBadgeKey = "reports" | "lairs";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminNavIcon;
  /** Le compteur affiché à droite de l'entrée, s'il n'est pas nul. */
  badge?: AdminNavBadgeKey;
  /** Ce que la palette de recherche cherche en plus du libellé. */
  keywords?: string[];
};

export type AdminNavGroup = {
  /** Vide pour le premier groupe, qui n'a pas besoin de titre. */
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAVIGATION: AdminNavGroup[] = [
  {
    title: "",
    items: [{ href: "/admin", label: "Accueil", icon: "home", keywords: ["tableau de bord"] }],
  },
  {
    title: "Modération",
    items: [
      { href: "/admin/reports", label: "Signalements", icon: "flag", badge: "reports", keywords: ["modération"] },
      { href: "/admin/contributions", label: "Contributions", icon: "inbox", keywords: ["publications"] },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/admin/games", label: "Jeux", icon: "dice" },
      { href: "/admin/cards", label: "Cartes", icon: "card", keywords: ["variantes", "impressions"] },
      { href: "/admin/products", label: "Produits", icon: "box", keywords: ["boîtes", "figurines"] },
      { href: "/admin/achievements", label: "Succès", icon: "trophy", keywords: ["trophées", "badges"] },
    ],
  },
  {
    title: "Communauté",
    items: [
      { href: "/admin/users", label: "Utilisateurs", icon: "users", keywords: ["joueurs", "profils"] },
      { href: "/admin/lairs", label: "Lieux", icon: "pin", badge: "lairs", keywords: ["boutiques", "agenda", "imports"] },
      { href: "/admin/tournaments", label: "Règles de tournoi", icon: "swords", keywords: ["format", "départage"] },
    ],
  },
  {
    title: "Système",
    items: [
      { href: "/admin/exports", label: "Exports", icon: "download" },
      { href: "/admin/discord", label: "Discord", icon: "chat", keywords: ["commandes"] },
      { href: "/admin/settings", label: "Réglages", icon: "sliders", keywords: ["modèle", "deck en photo"] },
    ],
  },
];

/**
 * L'entrée du menu qui correspond à une adresse : la plus longue qui la
 * préfixe, pour que `/admin/lairs/123` allume « Lieux » et pas « Accueil ».
 */
export function findActiveAdminNavHref(pathname: string): string | undefined {
  const hrefs = ADMIN_NAVIGATION.flatMap((group) => group.items.map((item) => item.href));
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
