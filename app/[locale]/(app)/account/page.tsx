import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import CommunityBottomNav from "@/components/users/CommunityBottomNav.tsx";
import { auth } from "@/lib/auth.ts";
import { getUserById } from "@/lib/db/users.ts";

import AccountTabsBar, { readAccountTab, type AccountTab } from "./AccountTabsBar.tsx";
import { GamesTabView, ProfileTabView } from "./AccountTabViews.tsx";
import LegacyAnchorRedirect from "./LegacyAnchorRedirect.tsx";
import AchievementsTabView from "./achievements/AchievementsTabView.tsx";
import NotificationsTabView from "./notifications/NotificationsTabView.tsx";
import SubscriptionTabView from "./subscription/SubscriptionTabView.tsx";
import ShowcaseTabView from "./showcase/ShowcaseTabView.tsx";

type AccountSearchParams = Promise<{ tab?: string }>;

/**
 * L'espace personnel, en onglets.
 *
 * Six onglets pilotés par `?tab=` plutôt que six routes : la configuration de
 * routage de Vercel plafonne à 2048 entrées et chaque segment y est multiplié
 * par les quatre locales — c'est la raison qui a mené les groupes de jeu au
 * `?view=` et les lieux au `?tab=`. Les trois anciennes routes sœurs
 * redirigent, et les deux ancres héritées (`#jeux`, `#prices`) atterrissent au
 * bon endroit.
 *
 * Tout cet écran est derrière la porte, titre compris : on ne montre pas la
 * mise en page d'un espace personnel avant de savoir à qui il appartient. La
 * coquille ne garde que le conteneur et la silhouette.
 */
async function AccountPageContent({ searchParams }: { searchParams: AccountSearchParams }) {
  const [{ tab }, session] = await Promise.all([
    searchParams,
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!session?.user) {
    redirect("/login");
  }

  const [user, t] = await Promise.all([
    getUserById(session.user.id),
    getTranslations("Account"),
  ]);

  if (!user) {
    redirect("/login");
  }

  const active = readAccountTab(tab);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto max-w-5xl px-4 pb-20 lg:pb-0">
        <LegacyAnchorRedirect />

        <div className="mb-6 space-y-2">
          <h1 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <AccountTabsBar active={active} />

        <AccountTabContent tab={active} user={user} />
      </div>

      <CommunityBottomNav active={active === "showcase" ? "profile" : "settings"} />
    </div>
  );
}

function AccountTabContent({ tab, user }: { tab: AccountTab; user: NonNullable<Awaited<ReturnType<typeof getUserById>>> }) {
  switch (tab) {
    case "showcase":
      return <ShowcaseTabView user={user} />;
    case "games":
      return <GamesTabView user={user} />;
    case "achievements":
      return <AchievementsTabView user={user} />;
    case "notifications":
      return <NotificationsTabView user={user} />;
    case "subscription":
      return <SubscriptionTabView />;
    default:
      return <ProfileTabView user={user} />;
  }
}

export default function AccountPage({ searchParams }: { searchParams: AccountSearchParams }) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <AccountPanelSkeleton cards={3} label="Chargement de votre compte" />
        </div>
      }
    >
      <AccountPageContent searchParams={searchParams} />
    </Suspense>
  );
}
