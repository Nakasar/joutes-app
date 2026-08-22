import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import ReportButton from "@/components/ReportButton.tsx";
import { userProfilePath } from "@/lib/users/handle.ts";
import { sectionsForTab, visibleProfileTabs } from "@/lib/users/profile-tabs.ts";
import type { UserShowcaseSectionKey } from "@/lib/users/showcase.ts";

import ProfileAdminTools from "./ProfileAdminTools.tsx";
import ProfileArticleView from "./ProfileArticleView.tsx";
import ProfileHero from "./ProfileHero.tsx";
import { ProfileSkeleton } from "./ProfileSkeleton.tsx";
import ProfileTabsBar from "./ProfileTabsBar.tsx";
import {
  AboutSection,
  AchievementsSection,
  DecksSection,
  LiveSection,
  PublicationsSection,
  TradeSection,
} from "./ProfileSections.tsx";
import {
  FindMeCard,
  FollowedGamesCard,
  FollowedLairsCard,
  PlayGroupsCard,
  RecognitionsCard,
} from "./ProfileSidebar.tsx";
import { PrivateProfileCard, ProfileOnboarding } from "./ProfileStates.tsx";
import {
  readProfileAchievements,
  readProfileBadges,
  readProfileContents,
  readProfileDecks,
  readProfileLinks,
  readProfileLists,
  readProfileSections,
  requireProfile,
} from "./profile-data.ts";

type ProfileParams = Promise<{ userTagOrId: string }>;
type ProfileSearchParams = Promise<{ tab?: string; article?: string }>;

export async function generateMetadata({ params }: { params: ProfileParams }): Promise<Metadata> {
  const { userTagOrId } = await params;
  const [subject, t] = await Promise.all([
    requireProfile(userTagOrId),
    getTranslations("Users.profile.metadata"),
  ]);

  const description = subject.user.description?.slice(0, 160) || t("description", { tag: subject.tag });

  return {
    title: subject.tag,
    description,
    openGraph: {
      title: t("openGraphTitle", { tag: subject.tag }),
      description,
      images: subject.user.showcase?.banner ? [subject.user.showcase.banner] : [],
    },
    // Un profil privé reste joignable — la modération en a besoin — mais il n'a
    // pas demandé à être trouvé.
    robots: subject.isPublic ? undefined : { index: false, follow: false },
  };
}

/**
 * La vitrine d'un compte.
 *
 * Cinq onglets — vitrine, decks, publications, succès, souhaits et ventes — au
 * lieu d'une seule pile à dérouler. « Vitrine » empile tous les blocs activés,
 * les autres n'en isolent qu'un, et **un onglet dont le bloc est éteint ou vide
 * n'est pas rendu** : la barre décrit ce qui est là, jamais ce qui pourrait
 * l'être.
 *
 * L'onglet vit dans un paramètre d'URL et non dans un segment de route : la
 * configuration de routage de Vercel plafonne à 2048 entrées, et chaque segment
 * y est multiplié par les quatre locales. C'est la raison qui a mené les
 * groupes de jeu au `?view=` et les lieux au `?tab=`.
 *
 * Un profil **privé** se rend, il ne disparaît pas : son pseudonyme, ses
 * badges, son ancienneté, sa liste de vente et ses listes de souhaits publiques
 * restent — ce sont des choix qu'il a faits ailleurs. Ce que la confidentialité
 * coupe, c'est le contenu de la vitrine et la barre d'onglets avec.
 */
export default function UserProfilePage({
  params,
  searchParams,
}: {
  params: ProfileParams;
  searchParams: ProfileSearchParams;
}) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <UserProfile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function UserProfile({
  params,
  searchParams,
}: {
  params: ProfileParams;
  searchParams: ProfileSearchParams;
}) {
  const [{ userTagOrId }, search] = await Promise.all([params, searchParams]);

  // Un article se lit sur sa propre page, sans la vitrine autour : c'est un
  // texte, pas un bloc de plus.
  if (search.article) {
    return <ProfileArticleView userTagOrId={userTagOrId} contentId={search.article} />;
  }

  const subject = await requireProfile(userTagOrId);

  return (
    <div className="min-h-screen">
      <ProfileHero userTagOrId={userTagOrId} />

      {subject.isPublic && (
        <Suspense fallback={<div className="h-14 border-b" aria-hidden />}>
          <ProfileTabs userTagOrId={userTagOrId} tab={search.tab} />
        </Suspense>
      )}

      <div className="container mx-auto max-w-7xl px-4 pt-8 pb-11 lg:px-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-[34px]">
            <Suspense fallback={null}>
              <ProfileOnboarding userTagOrId={userTagOrId} />
            </Suspense>

            {subject.isPublic ? (
              <Suspense fallback={<BlocksSkeleton />}>
                <ProfileBlocks userTagOrId={userTagOrId} tab={search.tab} />
              </Suspense>
            ) : (
              <>
                <PrivateProfileCard userTagOrId={userTagOrId} />
                {/* Visible malgré tout : leur visibilité se décide liste par
                    liste, et a déjà été décidée. */}
                <Suspense fallback={null}>
                  <TradeSection userTagOrId={userTagOrId} />
                </Suspense>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Suspense fallback={<div className="h-40 rounded-xl bg-muted" aria-hidden />}>
              <RecognitionsCard userTagOrId={userTagOrId} />
            </Suspense>

            {subject.isPublic && (
              <Suspense fallback={null}>
                <FollowedGamesCard userTagOrId={userTagOrId} />
                <FollowedLairsCard userTagOrId={userTagOrId} />
                <PlayGroupsCard userTagOrId={userTagOrId} />
              </Suspense>
            )}

            <Suspense fallback={null}>
              <FindMeCard userTagOrId={userTagOrId} />
            </Suspense>

            <div className="flex flex-wrap items-center gap-2">
              <Suspense fallback={null}>
                <ProfileAdminTools userTagOrId={userTagOrId} />
              </Suspense>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function BlocksSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-[34px]" aria-hidden>
      {[0, 1].map((index) => (
        <div key={index} className="h-40 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

/** Ce que chaque bloc a réellement à montrer — la barre d'onglets s'en déduit. */
async function readSectionContent(userTagOrId: string) {
  const [decks, contents, achievements, lists, subject] = await Promise.all([
    readProfileDecks(userTagOrId),
    readProfileContents(userTagOrId),
    readProfileAchievements(userTagOrId),
    readProfileLists(userTagOrId),
    requireProfile(userTagOrId),
  ]);

  return {
    live: true,
    about: Boolean(subject.user.description) || (subject.user.showcase?.playStyles?.length ?? 0) > 0,
    decks: decks.length > 0,
    publications: contents.length > 0,
    achievements: achievements.unlocked.length > 0,
    follows: true,
    trade: lists.wishlists.length > 0 || (lists.sellList?.itemsCount ?? 0) > 0,
  } satisfies Partial<Record<UserShowcaseSectionKey, boolean>>;
}

async function ProfileTabs({ userTagOrId, tab }: { userTagOrId: string; tab?: string }) {
  const [subject, sections, content, badges, links] = await Promise.all([
    requireProfile(userTagOrId),
    readProfileSections(userTagOrId),
    readSectionContent(userTagOrId),
    readProfileBadges(userTagOrId),
    readProfileLinks(userTagOrId),
  ]);

  const tabs = visibleProfileTabs(sections, content);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <ProfileTabsBar
      profilePath={userProfilePath(subject.user)}
      displayName={subject.displayName}
      avatar={subject.avatar}
      plan={badges.plan}
      tabs={tabs}
      activeTab={tabs.includes(tab as never) ? (tab as never) : "showcase"}
      links={links}
    />
  );
}

/**
 * Les blocs, dans l'ordre réglé par le compte.
 *
 * Une carte de blocs puis un `filter().map()`, comme la vitrine d'un lieu : le
 * réglage décide de l'ordre et de la présence, chaque bloc décide s'il a
 * quelque chose à dire.
 */
async function ProfileBlocks({ userTagOrId, tab }: { userTagOrId: string; tab?: string }) {
  const [sections, content] = await Promise.all([
    readProfileSections(userTagOrId),
    readSectionContent(userTagOrId),
  ]);

  const tabs = visibleProfileTabs(sections, content);
  const activeTab = tabs.includes(tab as never) ? (tab as never) : "showcase";
  const keys = sectionsForTab(sections, activeTab);

  const blocks: Record<UserShowcaseSectionKey, React.ReactNode> = {
    live: <LiveSection key="live" userTagOrId={userTagOrId} />,
    about: <AboutSection key="about" userTagOrId={userTagOrId} />,
    decks: <DecksSection key="decks" userTagOrId={userTagOrId} />,
    publications: <PublicationsSection key="publications" userTagOrId={userTagOrId} />,
    achievements: <AchievementsSection key="achievements" userTagOrId={userTagOrId} />,
    // Jeux, lieux et groupes vivent dans la colonne de droite : le bloc n'a pas
    // de corps propre, seul son interrupteur compte.
    follows: null,
    trade: <TradeSection key="trade" userTagOrId={userTagOrId} />,
  };

  return <>{keys.map((key) => blocks[key])}</>;
}
