import { getTranslations } from "next-intl/server";
import { Settings, User, Users } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

/**
 * La navigation basse des écrans de communauté, sur téléphone.
 *
 * Elle n'est pas décorative : sous 860 px l'en-tête replie sa navigation, et
 * cette barre devient le seul point d'entrée vers le registre depuis un profil
 * ou depuis les réglages. Les trois écrans forment un aller-retour — on
 * parcourt, on regarde, on ajuste — et il faut pouvoir en faire le tour sans
 * ouvrir un menu.
 *
 * **Bornée à ces trois écrans**, et rendue par chacun d'eux plutôt que par la
 * mise en page de l'application : trois épaisseurs de chrome (l'en-tête, la
 * barre d'onglets collante, celle-ci) sont déjà beaucoup sur 640 px, et il n'y
 * a pas de raison de les imposer au reste du site.
 *
 * Chaque page qui la rend ajoute `pb-20 lg:pb-0` à son conteneur, faute de quoi
 * la barre recouvrirait sa dernière ligne.
 */

const TABS = [
  { key: "registry", href: "/users", icon: Users },
  { key: "profile", href: "/account?tab=showcase", icon: User },
  { key: "settings", href: "/account", icon: Settings },
] as const;

export default async function CommunityBottomNav({
  active,
}: {
  active: (typeof TABS)[number]["key"];
}) {
  const t = await getTranslations("Users.bottomNav");

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 shadow-[0_-6px_18px_rgba(0,0,0,.4)] backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;

          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[60px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px]",
                  isActive
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
