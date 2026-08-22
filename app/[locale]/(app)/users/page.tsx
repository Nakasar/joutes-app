import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";

import CommunityBottomNav from "@/components/users/CommunityBottomNav.tsx";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { getUserById } from "@/lib/db/users.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import type { Game } from "@/lib/types/Game";
import {
  REGISTRY_PAGE_SIZE,
  hasActiveFilters,
  readRegistryFilters,
  toRegistryParams,
} from "@/lib/users/registry-search.ts";

import LiveNowStrip from "./LiveNowStrip.tsx";
import RegistryFilters from "./RegistryFilters.tsx";
import RegistrySearchField from "./RegistrySearchField.tsx";
import { RegistryListSkeleton, RegistrySidebarSkeleton } from "./RegistrySkeletons.tsx";
import {
  LeaderboardCard,
  NearbyCard,
  SignedOutCard,
  YourProfileCard,
} from "./RegistrySidebar.tsx";
import UserCard from "./UserCard.tsx";
import { readRegistry, readRegistryViewer } from "./registry-data.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Users.registry.metadata");

  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      url: "https://joutes.app/users",
      siteName: "Joutes",
      title: t("openGraphTitle"),
      description: t("description"),
    },
  };
}

type RegistrySearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Le registre de la communauté.
 *
 * On ne parcourt pas un annuaire de joueurs pour le contempler : on y cherche
 * quelqu'un qui joue au même jeu, qui habite près, qui vend une carte, ou qui
 * diffuse en ce moment. Les quatre filtres sont exactement ces quatre raisons,
 * ils se cumulent, et chacun est une adresse — « les joueurs de Riftbound
 * autour de Thionville » se partage plutôt que se décrit.
 *
 * Tout l'état vit dans l'URL. La pagination aussi (`?count=`), ce qui garde la
 * page en composant serveur et fait survivre une liste chargée au
 * rechargement.
 */
export default function UsersPage({ searchParams }: { searchParams: RegistrySearchParams }) {
  return (
    <div className="container mx-auto max-w-7xl px-4 pt-8 pb-20 lg:px-10 lg:pb-11">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Suspense fallback={<RegistryListSkeleton />}>
            <RegistryMain searchParams={searchParams} />
          </Suspense>
        </div>

        <aside className="flex flex-col gap-4">
          <Suspense fallback={<RegistrySidebarSkeleton />}>
            <RegistryAside />
          </Suspense>
        </aside>
      </div>

      <CommunityBottomNav active="registry" />
    </div>
  );
}

async function RegistryMain({ searchParams }: { searchParams: RegistrySearchParams }) {
  const [params, t] = await Promise.all([searchParams, getTranslations("Users.registry")]);
  const filters = readRegistryFilters(params);

  const viewer = await readRegistryViewer();

  // Les jeux proposés en pastilles sont ceux que le visiteur suit : un
  // annuaire filtré par un jeu auquel on ne joue pas n'aide personne. Un
  // visiteur déconnecté n'en voit aucun, et cherche par le champ.
  const me = viewer.viewerId ? await getUserById(viewer.viewerId) : null;
  const followedGames = await Promise.all(
    (me?.games ?? []).slice(0, 4).map((id) => readGameBySlugOrId(id)),
  );

  return (
    <>
      <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.02em]">{t("title")}</h1>

      <RegistrySearchField value={filters.q} />

      <RegistryFilters
        filters={filters}
        games={followedGames.filter((game): game is Game => game !== null)}
        city={me?.location?.city}
      />

      <Suspense fallback={null}>
        <LiveNowStrip />
      </Suspense>

      <Suspense fallback={<RegistryListSkeleton />}>
        <RegistryList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RegistryList({ searchParams }: { searchParams: RegistrySearchParams }) {
  const [params, t] = await Promise.all([searchParams, getTranslations("Users.registry")]);
  const filters = readRegistryFilters(params);

  const [{ entries, total, hasMore }, viewer] = await Promise.all([
    readRegistry(filters),
    readRegistryViewer(),
  ]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
        {hasActiveFilters(filters) && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/users">{t("reset")}</Link>
          </Button>
        )}
      </div>
    );
  }

  const moreParams = new URLSearchParams(
    toRegistryParams({ ...filters, count: filters.count + REGISTRY_PAGE_SIZE }),
  ).toString();

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <UserCard key={entry.user.id} entry={entry} isAuthenticated={viewer.isAuthenticated} />
        ))}
      </ul>

      {hasMore && (
        <Button variant="outline" asChild className="self-center">
          {/* `scroll={false}` : la page s'allonge par le bas, la remonter en
              tête ferait perdre l'endroit où on lisait. */}
          <Link href={`/users?${moreParams}`} scroll={false}>
            {t("loadMore", { count: REGISTRY_PAGE_SIZE })}
          </Link>
        </Button>
      )}

      <p className="text-center font-mono text-[11px] text-muted-foreground">
        {t("shownOf", { shown: entries.length, total })}
      </p>
    </div>
  );
}

async function RegistryAside() {
  const viewer = await readRegistryViewer();

  return (
    <>
      {viewer.isAuthenticated ? <YourProfileCard /> : <SignedOutCard />}
      <NearbyCard />
      <LeaderboardCard />
    </>
  );
}
