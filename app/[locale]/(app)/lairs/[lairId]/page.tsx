import { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Calendar } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { getLairById } from "@/lib/db/lairs.ts";
import { readLairAccent } from "@/lib/lairs/theme.ts";

import LairHero from "./LairHero.tsx";
import LairTabsBar from "./LairTabsBar.tsx";
import LairLiveSection from "./LairLiveSection.tsx";
import LairNewsSection from "./LairNewsSection.tsx";
import LairFeaturedEvent from "./LairFeaturedEvent.tsx";
import LairUpcomingEvents from "./LairUpcomingEvents.tsx";
import LairAgendaTab, { LairAgendaRegistrations, LairAgendaRhythm } from "./LairAgendaTab.tsx";
import LairGamesTab from "./LairGamesTab.tsx";
import LairAboutTab, { LairAboutSidebar } from "./LairAboutTab.tsx";
import {
  LairFollowCard,
  LairGamesCard,
  LairOpeningHoursCard,
  LairPracticalInfoCard,
} from "./LairSidebar.tsx";
import {
  countUpcomingByGame,
  readFollowersCount,
  readLairEvents,
  readLairGames,
  readLairTab,
  readViewer,
  requireVisibleLair,
  upcomingOf,
  type LairTab,
} from "./lair-data.ts";
import {
  LairEventsSkeleton,
  LairPortalSkeleton,
  LairSidebarSkeleton,
} from "./LairPortalSkeletons.tsx";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lairId: string }>;
}): Promise<Metadata> {
  const { lairId } = await params;
  const t = await getTranslations("Lairs");

  // Même piège Mongo que dans le corps, à désarmer une seconde fois : les
  // métadonnées s'exécutent hors de la frontière de la page, avec leur propre
  // lecture du lieu.
  await connection();

  const lair = await getLairById(lairId);

  if (!lair) {
    return {
      title: t("detail.notFound"),
    };
  }

  return {
    title: t("detail.metadata.title", { name: lair.name }),
    description: t("detail.metadata.description", { name: lair.name, count: lair.games.length }),
    openGraph: {
      title: lair.name,
      description: t("detail.metadata.openGraphDescription", { name: lair.name }),
      images: lair.banner ? [lair.banner] : [],
    },
  };
}

type LairParams = Promise<{ lairId: string }>;
type LairSearchParams = Promise<{
  tab?: string;
  scope?: string;
  month?: string;
  year?: string;
  gameId?: string;
}>;

/**
 * La vitrine d'un lieu.
 *
 * Quatre onglets — actualités, agenda, jeux, à propos — au lieu d'une seule
 * page à dérouler : un lieu actif publie assez pour que chacun de ces sujets
 * mérite sa page, et un habitué vient toujours chercher l'un des quatre.
 *
 * Tout ce que la page dessine dépend du lieu : la barre d'onglets porte son
 * logo et son nom, et son accent devient `--lair-accent` sur le conteneur —
 * or ces déclinaisons se dérivent en CSS **sur l'élément qui pose l'accent**,
 * si bien qu'il n'y a pas d'échelon plus haut où l'appliquer. La lecture du
 * lieu vit donc sous une frontière commune, avec la vitrine derrière elle, et
 * la coquille de la page reste statique. Les deux colonnes gardent en plus la
 * leur : elles dépendent des événements et des jeux, qui coûtent davantage.
 *
 * Un lieu sans personnalisation retombe naturellement sur la page nue :
 * chaque bloc de la vitrine disparaît quand son contenu est absent, et
 * `--lair-accent` retombe sur `--primary`.
 */
export default function LairDetailPage({
  params,
  searchParams,
}: {
  params: LairParams;
  searchParams: LairSearchParams;
}) {
  return (
    <Suspense fallback={<LairPortalSkeleton />}>
      <LairPortal params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LairPortal({
  params,
  searchParams,
}: {
  params: LairParams;
  searchParams: LairSearchParams;
}) {
  const [{ lairId }, search] = await Promise.all([params, searchParams]);
  const lair = await requireVisibleLair(lairId);

  const accent = readLairAccent(lair);
  const activeTab = readLairTab(search.tab);
  const { canManageLair } = await readViewer(lairId);

  return (
    <div className="lair-theme min-h-screen" style={accent.style}>
      <LairHero lairId={lairId} />

      <LairTabsBar
        lairId={lairId}
        lairName={lair.name}
        logo={lair.options?.theme?.logo}
        activeTab={activeTab}
        canManageLair={canManageLair}
      />

      <div className="container mx-auto max-w-7xl px-4 pt-8 pb-11 lg:px-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-[34px]">
            <Suspense fallback={<LairEventsSkeleton />}>
              <LairTabContent lairId={lairId} tab={activeTab} search={search} />
            </Suspense>
          </div>

          <aside className="flex flex-col gap-4">
            <Suspense fallback={<LairSidebarSkeleton />}>
              <LairTabSidebar lairId={lairId} tab={activeTab} />
            </Suspense>
          </aside>
        </div>
      </div>
    </div>
  );
}

async function LairTabContent({
  lairId,
  tab,
  search,
}: {
  lairId: string;
  tab: LairTab;
  search: Awaited<LairSearchParams>;
}) {
  const lair = await requireVisibleLair(lairId);

  if (tab === "about") {
    return <LairAboutTab lair={lair} />;
  }

  const events = await readLairEvents(lairId);

  if (tab === "agenda") {
    return (
      <LairAgendaTab
        lair={lair}
        events={events}
        month={search.month}
        year={search.year}
        gameId={search.gameId}
      />
    );
  }

  if (tab === "games") {
    const games = await readLairGames(lairId);
    return <LairGamesTab games={games} upcomingByGame={countUpcomingByGame(events)} />;
  }

  return <LairNewsTab lairId={lairId} scope={search.scope} />;
}

/**
 * L'onglet d'accueil : ce qui se passe maintenant, ce qui change, ce qui vient.
 *
 * L'ordre n'est pas négociable — le direct passe avant tout parce qu'il est
 * périssable, les annonces avant l'agenda parce qu'elles le corrigent parfois.
 */
async function LairNewsTab({ lairId, scope }: { lairId: string; scope?: string }) {
  const [lair, events, games, { canManageLair, followedGameIds, userId }, t] = await Promise.all([
    requireVisibleLair(lairId),
    readLairEvents(lairId),
    readLairGames(lairId),
    readViewer(lairId),
    getTranslations("Lairs.detail"),
  ]);

  const upcoming = upcomingOf(events);

  // L'événement à la une ne compte que s'il est encore à venir : un lieu qui
  // oublie de changer son choix après le tournoi ne doit pas garder une
  // affiche périmée en tête de page. Il reste dans la liste en dessous, à sa
  // date et marqué de l'accent : la liste dit *quand* on peut venir, et y
  // creuser un trou au jour du plus gros tournoi serait un contresens.
  const featuredId = lair.options?.featuredEventId;
  const featured = featuredId ? upcoming.find((event) => event.id === featuredId) : undefined;

  // Les événements portent le nom de leur jeu, jamais son identifiant : les
  // jeux suivis par le visiteur doivent donc être traduits en noms, et seuls
  // ceux que le lieu propose comptent pour la bascule.
  const followedGameNames = games
    .filter((game) => followedGameIds.includes(game.id))
    .map((game) => game.name);

  const gameColors = Object.fromEntries(
    games.filter((game) => game.color).map((game) => [game.name, game.color]),
  );

  const hasNews = (lair.options?.news?.length ?? 0) > 0;

  return (
    <>
      <LairLiveSection lair={lair} canManageLair={canManageLair} />

      {hasNews && <LairNewsSection news={lair.options?.news ?? []} />}

      {featured && <LairFeaturedEvent event={featured} />}

      <LairUpcomingEvents
        lairId={lairId}
        events={upcoming}
        followedGameNames={followedGameNames}
        gameColors={gameColors}
        featuredEventId={featuredId}
        initialScope={userId && followedGameNames.length > 0 ? "mine" : "all"}
      />

      {canManageLair && (
        <div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/lairs/${lairId}/events/new`}>
              <Calendar className="mr-2 h-4 w-4" />
              {t("addEvent")}
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}

async function LairTabSidebar({ lairId, tab }: { lairId: string; tab: LairTab }) {
  const lair = await requireVisibleLair(lairId);

  if (tab === "about") {
    return <LairAboutSidebar lair={lair} />;
  }

  if (tab === "agenda") {
    const [events, { userId }] = await Promise.all([readLairEvents(lairId), readViewer(lairId)]);

    return (
      <>
        <LairAgendaRegistrations events={events} userId={userId} />
        <LairPracticalInfoCard lair={lair} />
        <LairAgendaRhythm lair={lair} />
      </>
    );
  }

  const [events, games, followersCount] = await Promise.all([
    readLairEvents(lairId),
    readLairGames(lairId),
    readFollowersCount(lairId),
  ]);

  return (
    <>
      <LairPracticalInfoCard lair={lair} />
      <LairOpeningHoursCard lair={lair} />
      <LairFollowCard lair={lair} followersCount={followersCount} />
      <LairGamesCard lairId={lairId} games={games} upcomingByGame={countUpcomingByGame(events)} />
    </>
  );
}
