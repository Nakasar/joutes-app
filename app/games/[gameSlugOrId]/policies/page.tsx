import {auth} from "@/lib/auth";
import {getAllPolicies, countAllPolicies} from "@/lib/db/policies";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {Metadata} from "next/types";
import PoliciesClientView from "./PoliciesClientView";
import {Button} from "@/components/ui/button";
import Link from "next/link";
import {hasPermission} from "@/lib/db/permissions";
import AddPolicyDialog from "@/app/games/[gameSlugOrId]/policies/AddPolicyDialog";
import { getTranslations } from "next-intl/server";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar";

const PAGE_SIZE = 20;

export async function generateMetadata({
                                         params
                                       }: {
  params: Promise<{ gameSlugOrId: string }>
}): Promise<Metadata> {
  const {gameSlugOrId} = await params;
  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});
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

export default async function GamePoliciesPage({
                                                 params,
                                                 searchParams,
                                               }: {
  params: Promise<{ gameSlugOrId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const {gameSlugOrId} = await params;

  const game = await db.collection<Game>("games").findOne({slug: gameSlugOrId});
  if (!game || !game.slug) notFound();

  const gameId = game._id.toString();

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
  const t = await getTranslations("Games");

  return (
    <div className="container mx-auto p-6">
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
      <div className="flex items-center justify-end my-4 w-full">
        {userCanUpdatePolicies && <AddPolicyDialog gameId={gameId} gameSlug={game.slug}/>}
      </div>

      <PoliciesClientView
        initialPolicies={policies}
        initialTotalCount={totalCount}
        initialPage={currentPage}
        pageSize={PAGE_SIZE}
        gameId={gameId}
        gameSlug={gameSlugOrId}
        userCanUpdatePolicies={userCanUpdatePolicies}
        userCanVotePolicies={userCanVotePolicies}
      />
    </div>
  );
}