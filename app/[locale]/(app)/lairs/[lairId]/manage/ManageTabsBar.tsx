import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

export const MANAGE_TABS = ["details", "customization", "news", "events", "owners", "subscription"] as const;

export type ManageTab = (typeof MANAGE_TABS)[number];

/** L'onglet demandé, ou « Détails » si la valeur d'URL ne dit rien de connu. */
export function readManageTab(value: string | undefined): ManageTab {
  return MANAGE_TABS.includes(value as ManageTab) ? (value as ManageTab) : "details";
}

/**
 * La navigation de l'écran de gestion.
 *
 * Des liens et un paramètre d'URL plutôt qu'un état local : l'onglet ouvert
 * survit ainsi au rechargement qui suit un enregistrement, et se partage — un
 * gérant peut envoyer « la page des actualités » à son associé.
 */
export default async function ManageTabsBar({
  lairId,
  active,
}: {
  lairId: string;
  active: ManageTab;
}) {
  const t = await getTranslations("Lairs.manage.tabs");

  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b">
      {MANAGE_TABS.map((tab) => (
        <Link
          key={tab}
          href={tab === "details" ? `/lairs/${lairId}/manage` : `/lairs/${lairId}/manage?tab=${tab}`}
          aria-current={tab === active ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors",
            tab === active
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}
