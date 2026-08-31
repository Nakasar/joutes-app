import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

export const LAIR_TABS = ["identite", "jeux", "sources", "vitrine"] as const;

export type LairTab = (typeof LAIR_TABS)[number];

const LABELS: Record<LairTab, string> = {
  identite: "Identité",
  jeux: "Jeux",
  sources: "Sources d'événements",
  vitrine: "Vitrine et accès",
};

/** L'onglet demandé, ou « Identité » si la valeur d'URL ne dit rien de connu. */
export function readLairTab(value: string | undefined): LairTab {
  return LAIR_TABS.includes(value as LairTab) ? (value as LairTab) : "identite";
}

export default function LairTabsBar({ lairId, active }: { lairId: string; active: LairTab }) {
  return (
    <nav
      aria-label="Sections du lieu"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
    >
      {LAIR_TABS.map((tab) => (
        <Link
          key={tab}
          href={tab === "identite" ? `/admin/lairs/${lairId}` : `/admin/lairs/${lairId}?tab=${tab}`}
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
