import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

export const GAME_TABS = ["identite", "liens", "fonctionnalites", "deck", "lieux", "tournois"] as const;

export type GameTab = (typeof GAME_TABS)[number];

const LABELS: Record<GameTab, string> = {
  identite: "Identité",
  liens: "Liens et réseaux",
  fonctionnalites: "Fonctionnalités",
  deck: "Deck builder",
  lieux: "Lieux mis en avant",
  tournois: "Tournois",
};

/** L'onglet demandé, ou « Identité » si la valeur d'URL ne dit rien de connu. */
export function readGameTab(value: string | undefined): GameTab {
  return GAME_TABS.includes(value as GameTab) ? (value as GameTab) : "identite";
}

/**
 * La navigation de la fiche d'un jeu.
 *
 * Des liens et un paramètre d'URL plutôt qu'un état local, comme l'écran de
 * gestion d'un lieu : l'onglet ouvert survit au rechargement qui suit un
 * enregistrement, et s'envoie tel quel à quelqu'un d'autre.
 */
export default function GameTabsBar({
  gameSlug,
  active,
}: {
  gameSlug: string;
  active: GameTab;
}) {
  return (
    <nav
      aria-label="Sections du jeu"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
    >
      {GAME_TABS.map((tab) => (
        <Link
          key={tab}
          href={
            tab === "identite"
              ? `/admin/games/${gameSlug}`
              : `/admin/games/${gameSlug}?tab=${tab}`
          }
          aria-current={tab === active ? "page" : undefined}
          className={cn(
            "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
            tab === active
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[tab]}
        </Link>
      ))}
    </nav>
  );
}
