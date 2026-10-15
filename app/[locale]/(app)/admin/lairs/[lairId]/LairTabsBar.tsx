import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

export const LAIR_TABS = ["identite", "jeux", "sources", "vitrine"] as const;

export type LairTab = (typeof LAIR_TABS)[number];

const LABELS: Record<LairTab, string> = {
  identite: "Identité",
  jeux: "Jeux",
  sources: "Agenda",
  vitrine: "Vitrine et accès",
};

/** L'onglet demandé, ou « Identité » si la valeur d'URL ne dit rien de connu. */
export function readLairTab(value: string | undefined): LairTab {
  return LAIR_TABS.includes(value as LairTab) ? (value as LairTab) : "identite";
}

/** `alert` marque l'onglet Agenda d'un point rouge quand il demande une intervention. */
export default function LairTabsBar({
  lairId,
  active,
  alert = false,
}: {
  lairId: string;
  active: LairTab;
  alert?: boolean;
}) {
  return (
    <nav
      aria-label="Sections du lieu"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {LAIR_TABS.map((tab) => (
        <Link
          key={tab}
          href={tab === "identite" ? `/admin/lairs/${lairId}` : `/admin/lairs/${lairId}?tab=${tab}`}
          aria-current={tab === active ? "page" : undefined}
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm transition-colors",
            tab === active
              ? "border-sky-600 font-semibold text-foreground dark:border-sky-400"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[tab]}
          {tab === "sources" && alert && (
            <span className="size-2 rounded-full bg-red-600" aria-label="à surveiller" />
          )}
        </Link>
      ))}
    </nav>
  );
}
