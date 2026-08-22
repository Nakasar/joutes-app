import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Les onglets de l'espace personnel.
 *
 * Ils remplacent la rangée de boutons qui les précédait, dont un commentaire du
 * code disait qu'un cinquième élargirait déjà toute la page sur un téléphone —
 * et il en fallait un sixième pour « Ma vitrine ». Une barre qui défile
 * horizontalement tient ce que la rangée ne tenait plus.
 *
 * Des liens et un paramètre d'URL plutôt qu'un état local : l'onglet ouvert
 * survit au rechargement qui suit un enregistrement, et se partage. C'est aussi
 * la seule forme tenable — la configuration de routage de Vercel plafonne à
 * 2048 entrées, et chaque segment de route y est multiplié par les quatre
 * locales.
 *
 * **Sécurité et Intégrations n'y figurent pas.** Ce sont des écrans avancés,
 * atteints depuis l'onglet Profil ; les mettre ici allongerait la barre de deux
 * entrées qu'on ouvre trois fois par an.
 */

export const ACCOUNT_TABS = [
  "profile",
  "showcase",
  "games",
  "achievements",
  "notifications",
  "subscription",
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number];

/** L'onglet demandé, ou « Profil » si la valeur d'URL ne dit rien de connu. */
export function readAccountTab(value: string | undefined): AccountTab {
  return ACCOUNT_TABS.includes(value as AccountTab) ? (value as AccountTab) : "profile";
}

export function accountTabHref(tab: AccountTab): string {
  return tab === "profile" ? "/account" : `/account?tab=${tab}`;
}

export default async function AccountTabsBar({ active }: { active: AccountTab }) {
  const t = await getTranslations("Account.tabs");

  return (
    <nav
      aria-label={t("label")}
      className="mb-8 flex gap-1 overflow-x-auto overflow-y-hidden border-b [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ACCOUNT_TABS.map((tab) => (
        <Link
          key={tab}
          href={accountTabHref(tab)}
          aria-current={tab === active ? "page" : undefined}
          className={cn(
            // 44 px de cible tactile : les 38 px du gabarit précédent passaient
            // sous le minimum sur un téléphone.
            "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
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
