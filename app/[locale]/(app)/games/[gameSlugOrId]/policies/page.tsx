import {auth} from "@/lib/auth.ts";
import {getAllPolicies, countAllPolicies} from "@/lib/db/policies.ts";
import {readGameBySlugOrId} from "@/lib/db/games-cached.ts";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {Metadata} from "next/types";
import {Suspense} from "react";
import PoliciesClientView from "./PoliciesClientView.tsx";
import {PoliciesHeaderSkeleton, PoliciesListSkeleton} from "./PoliciesSkeletons.tsx";
import {Button} from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import {hasPermission} from "@/lib/db/permissions.ts";
import AddPolicyDialog from "@/app/[locale]/(app)/games/[gameSlugOrId]/policies/AddPolicyDialog.tsx";
import { getLocale, getTranslations } from "next-intl/server";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar.tsx";
import {ObjectId} from "mongodb";
import {resolveCardMentions} from "@/lib/game-content-cards.ts";

const PAGE_SIZE = 20;

type GameParams = Promise<{ gameSlugOrId: string }>;

export async function generateMetadata({
                                         params
                                       }: {
  params: GameParams
}): Promise<Metadata> {
  const {gameSlugOrId} = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games");

  if (!game) {
    return {
      title: t("policies.metadata.notFoundTitle"),
    };
  }

  return {
    title: t("policies.metadata.title", { gameName: game.name }),
    description: t("policies.metadata.description", { gameName: game.name }),
    openGraph: {
      title: t("policies.metadata.title", { gameName: game.name }),
      description: t("policies.metadata.description", { gameName: game.name }),
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * Deux frontières : l'en-tête ne dépend que du jeu, la liste dépend en plus de
 * la session — les droits d'ajout et de vote — et de la page demandée.
 *
 * La page n'attend plus rien elle-même. Les promesses descendent telles quelles
 * et ne sont attendues que sous frontière ; les attendre ici rendrait toute la
 * route dynamique.
 */
export default function GamePoliciesPage({
                                           params,
                                           searchParams,
                                         }: {
  params: GameParams;
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <div className="container mx-auto p-6">
      <Suspense fallback={<PoliciesHeaderSkeleton />}>
        <PoliciesHeader params={params} />
      </Suspense>

      <Suspense fallback={<PoliciesListSkeleton />}>
        <PoliciesList params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PoliciesHeader({ params }: { params: GameParams }) {
  const {gameSlugOrId} = await params;

  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game || !game.slug) notFound();

  const t = await getTranslations("Games");

  return (
    <div className="flex flex-row flex-wrap justify-between">
      <div className="flex flex-row flex-wrap gap-4">
        <Button asChild>
          <Link href={`/games/${game.slug}`} className="text-blue-600 hover:underline">
            ← {t("policies.back")}
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t("policies.title", { gameName: game.name })}</h1>
      </div>
      <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'policies'} />
    </div>
  );
}

async function PoliciesList({
                              params,
                              searchParams,
                            }: {
  params: GameParams;
  searchParams: Promise<{ page?: string }>;
}) {
  const {gameSlugOrId} = await params;

  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game || !game.slug) notFound();

  const gameId = game.id;

  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;

  const {page: pageParam} = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [policies, totalCount, userCanUpdatePolicies, userCanVotePolicies] = await Promise.all([
    getAllPolicies({gameId, userId, offset, limit: PAGE_SIZE}),
    countAllPolicies({gameId}),
    hasPermission("policies:update"),
    hasPermission("policies:vote"),
  ]);
  const {cardIdByName, cardsById} = await resolveCardMentions(
    new ObjectId(gameId),
    policies.flatMap((p) => [p.content, ...(p.translations ?? []).map((tr) => tr.content)])
  );
  const locale = await getLocale();
  const ruleLang = locale === "fr" ? "fr" : "en";

  return (
    <>
      <div className="flex items-center justify-end my-4 w-full">
        {userCanUpdatePolicies && <AddPolicyDialog gameId={gameId} gameSlug={game.slug}/>}
      </div>

      <PoliciesClientView
        initialPolicies={policies}
        initialTotalCount={totalCount}
        initialPage={currentPage}
        initialCardIdByName={cardIdByName}
        initialCardsById={cardsById}
        pageSize={PAGE_SIZE}
        gameId={gameId}
        gameSlug={gameSlugOrId}
        ruleLang={ruleLang}
        userCanUpdatePolicies={userCanUpdatePolicies}
        userCanVotePolicies={userCanVotePolicies}
      />
    </>
  );
}
