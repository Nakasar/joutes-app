import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getLairsByIds } from "@/lib/db/lairs.ts";
import { getNews } from "@/lib/db/news.ts";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GAME_TYPES } from "@/lib/constants/game-types.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, Calendar, Users, MapPin } from "lucide-react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users.ts";
import FavoriteGameButton from "./FavoriteGameButton.tsx";
import FollowGameButton from "./FollowGameButton.tsx";
import { FeaturedEventsAgenda } from "./FeaturedEventsAgenda.tsx";
import { GameNewsSection } from "./GameNewsSection.tsx";
import { getTranslations } from "next-intl/server";
import { Suspense, cache } from "react";
import { connection } from "next/server";
import {
  GameActionsSkeleton,
  GameHeroSkeleton,
  GameSectionSkeleton,
} from "./GamePortalSkeletons.tsx";

interface GameDetailPageProps {
  params: Promise<{
    gameSlugOrId: string;
  }>;
}

export async function generateMetadata({ params }: GameDetailPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games");

  if (!game) {
    return {
      title: t("detail.metadata.notFoundTitle"),
    };
  }

  return {
    title: t("detail.metadata.title", { gameName: game.name }),
    description: game.description,
    openGraph: {
      url: `https://joutes.app/games/${gameSlugOrId}`,
      siteName: 'Joutes - Star Wars Unlimited',
      title: game.name,
      description: t("detail.metadata.ogDescription", { gameName: game.name }),
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * Le jeu, lu une fois par rendu.
 *
 * Six sections le demandent, chacune sous sa propre frontière. La lecture est
 * déjà en cache — donc sans requête supplémentaire — mais `cache` de React
 * évite en plus de refaire le `notFound()` six fois.
 */
const requireGame = cache(async (gameSlugOrId: string) => {
  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game) {
    notFound();
  }
  return game;
});

/**
 * Le portail d'un jeu, découpé par ce dont chaque section dépend.
 *
 * Trois dépendances distinctes se croisent ici, et les mélanger ferait attendre
 * le tout à la plus lente :
 *
 * - **le jeu seul** — héros, présentation, outils, communauté. Lecture en
 *   cache : ces sections arrivent quasiment tout de suite ;
 * - **la session** — les boutons Suivre et Favori, qui demandent en plus de
 *   lire le compte. Ils ont leur frontière *dans* le héros, pour que le titre
 *   du jeu ne les attende pas ;
 * - **une seconde lecture en base** — les actualités et l'agenda des lieux mis
 *   en avant.
 *
 * Rien de tout cela n'atteint la coquille : la route a un segment dynamique,
 * donc rien de localisé ni de dérivé du paramètre ne peut y tenir (voir le
 * document d'adoption). Ce que le découpage gagne est l'ordre d'arrivée.
 */
export default function GameDetailPage({ params }: GameDetailPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
      <Suspense fallback={<GameHeroSkeleton />}>
        <GameHero params={params} />
      </Suspense>

      <div className="relative z-20 max-w-7xl mx-auto px-8 py-16 space-y-16">
        <Suspense fallback={<GameSectionSkeleton cards={1} />}>
          <GameAbout params={params} />
        </Suspense>

        <Suspense fallback={<GameSectionSkeleton cards={6} />}>
          <GameTools params={params} />
        </Suspense>

        <Suspense fallback={<GameSectionSkeleton cards={3} columns={3} />}>
          <GameNews params={params} />
        </Suspense>

        {/* Pas de silhouette : cet agenda n'existe que pour les jeux qui ont des
            lieux mis en avant, et lui réserver sa place laisserait un trou sur
            tous les autres. */}
        <Suspense fallback={null}>
          <GameAgenda params={params} />
        </Suspense>

        <Suspense fallback={<GameSectionSkeleton cards={3} columns={3} />}>
          <GameCommunity params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function GameHero({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const [game, t] = await Promise.all([requireGame(gameSlugOrId), getTranslations("Games")]);

  return (
    <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
      {game.banner ? (
        <div className="absolute inset-0">
          <img
            src={game.banner}
            alt={game.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-black" />
      )}

      <div className="absolute top-8 left-8 z-20">
        <Link href="/games">
          <Button variant="secondary" className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("detail.back")}
          </Button>
        </Link>
      </div>

      <div className="absolute inset-0 flex items-end z-10">
        <div className="w-full max-w-7xl mx-auto px-8 pb-16 space-y-6">
          {game.icon && (
            <div className="w-32 h-32 rounded-lg overflow-hidden shadow-2xl border-4 border-white/20">
              <img
                src={game.icon}
                alt={game.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <h1 className="text-5xl md:text-7xl font-bold text-white drop-shadow-2xl animate-fade-in">
            {game.name}
          </h1>

          <div className="flex gap-3 items-center animate-fade-in animate-delay-100">
            <Badge variant="secondary" className="text-base px-4 py-2 bg-white/20 backdrop-blur-sm text-white border-white/30">
              {GAME_TYPES[game.type]}
            </Badge>
          </div>

          <p className="text-xl text-gray-200 max-w-3xl leading-relaxed drop-shadow-lg animate-fade-in animate-delay-200">
            {game.description}
          </p>

          <div className="flex flex-wrap gap-4 pt-4 animate-fade-in animate-delay-300">
            {/* Les boutons de suivi demandent la session, et le compte derrière
                elle. Leur frontière est ici plutôt qu'autour du héros : le nom
                du jeu n'a aucune raison d'attendre l'identité du visiteur. */}
            <Suspense fallback={<GameActionsSkeleton />}>
              <GameActions gameId={game.id} />
            </Suspense>
            <Link href={`/events?gameId=${game.id}`}>
              <Button size="lg" variant="secondary" className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70 px-8">
                <Calendar className="h-5 w-5 mr-2" />
                {t("detail.viewEvents")}
              </Button>
            </Link>
            <Link href={`/lairs?gameId=${game.id}`}>
              <Button size="lg" variant="secondary" className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70 px-8">
                <MapPin className="h-5 w-5 mr-2" />
                {t("detail.findLair")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

async function GameActions({ gameId }: { gameId: string }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  let isFollowing = false;
  let isFavorite = false;
  if (session?.user?.id) {
    const user = await getUserById(session.user.id);
    isFollowing = user?.games?.includes(gameId) ?? false;
    isFavorite = user?.favoriteGames?.includes(gameId) ?? false;
  }

  return (
    <>
      <FollowGameButton
        gameId={gameId}
        isFollowing={isFollowing}
        isAuthenticated={!!session?.user?.id}
      />
      {/* Un favori se choisit parmi les jeux suivis : proposer l'étoile
          avant le suivi promettrait une action que le serveur refuse. */}
      {isFollowing && (
        <FavoriteGameButton gameId={gameId} isFavorite={isFavorite} />
      )}
    </>
  );
}

async function GameAbout({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const [game, t] = await Promise.all([requireGame(gameSlugOrId), getTranslations("Games")]);

  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-bold text-white">{t("detail.about")}</h2>
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8">
        <p className="text-gray-300 text-lg leading-relaxed">
          {game.description}
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-8 pt-8 border-t border-white/10">
          <div>
            <h3 className="text-sm text-gray-400 uppercase tracking-wider mb-2">{t("detail.gameType")}</h3>
            <p className="text-white text-lg font-semibold">{GAME_TYPES[game.type]}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

async function GameTools({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const [game, t] = await Promise.all([requireGame(gameSlugOrId), getTranslations("Games")]);

  return (
    <section>
      <h2 className="text-3xl font-bold text-white">{t("detail.tools")}</h2>
        <div className="grid md:grid-cols-2 gap-6 mt-4">
          {game.features?.cards && (
            <Link href={`/games/${game.slug}/cards`} className="group">
              <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 backdrop-blur-sm rounded-xl border border-red-500/20 p-8 hover:border-red-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsCards.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsCards.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.tournaments && (
            <Link href={`/games/${game.slug}/tournaments`} className="group">
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 backdrop-blur-sm rounded-xl border border-green-500/20 p-8 hover:border-green-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsTournaments.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsTournaments.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.products && (
            <Link href={`/games/${game.slug ?? game.id}/products`} className="group">
              <div className="bg-gradient-to-br from-teal-900/30 to-teal-800/20 backdrop-blur-sm rounded-xl border border-teal-500/20 p-8 hover:border-teal-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsProducts.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsProducts.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.battleReports && (
            <Link href={`/game-matches/new?gameId=${game.id}`} className="group">
              <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 backdrop-blur-sm rounded-xl border border-amber-500/20 p-8 hover:border-amber-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsBattleReports.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsBattleReports.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.collection && (
            <Link href={`/collection/${game.slug}`} className="group">
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 backdrop-blur-sm rounded-xl border border-blue-500/20 p-8 hover:border-blue-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsCollection.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsCollection.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.rules && (
            <Link href={`/games/${game.slug}/rules`} className="group">
              <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 backdrop-blur-sm rounded-xl border border-yellow-500/20 p-8 hover:border-yellow-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsRules.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsRules.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.policies && (
            <Link href={`/games/${game.slug}/policies`} className="group">
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 backdrop-blur-sm rounded-xl border border-purple-500/20 p-8 hover:border-purple-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsPolicies.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsPolicies.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.cubes && (
            <Link href={`/games/${game.slug}/cubes`} className="group">
              <div className="bg-gradient-to-br from-teal-900/30 to-teal-800/20 backdrop-blur-sm rounded-xl border border-teal-500/20 p-8 hover:border-teal-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsCubes.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsCubes.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.decks && (
            <Link href={`/games/${game.slug ?? game.id}/decks`} className="group">
              <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 backdrop-blur-sm rounded-xl border border-indigo-500/20 p-8 hover:border-indigo-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsDecks.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsDecks.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.quizz && (
            <Link href={`/games/${game.slug ?? game.id}/quizz`} className="group">
              <div className="bg-gradient-to-br from-pink-900/30 to-pink-800/20 backdrop-blur-sm rounded-xl border border-pink-500/20 p-8 hover:border-pink-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsQuizz.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsQuizz.description")}</p>
              </div>
            </Link>
          )}

          {game.features?.deckChecker && (
            <Link href={`/games/${game.slug}/deck-checker`} className="group">
              <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-8 hover:border-cyan-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsDeckChecker.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsDeckChecker.description")}</p>
              </div>
            </Link>
          )}

          {game.slug === "riftbound" && (
            <Link href={`/games/${game.slug}/tracker`} className="group">
              <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 backdrop-blur-sm rounded-xl border border-orange-500/20 p-8 hover:border-orange-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">{t("detail.toolsTracker.title")}</h3>
                <p className="text-gray-300">{t("detail.toolsTracker.description")}</p>
              </div>
            </Link>
          )}

          {game.slug === "riftbound" && (
            <Link href={`/games/${game.slug}/developers`} className="group">
              <div className="bg-gradient-to-br from-violet-900/30 to-fuchsia-800/20 backdrop-blur-sm rounded-xl border border-violet-500/20 p-8 hover:border-violet-500/50 transition-all hover:scale-105">
                <h3 className="text-xl font-bold text-white mb-2">Développeurs</h3>
                <p className="text-gray-300">Découvrez le MCP, le bot Discord et l&apos;API de Joutes pour Riftbound.</p>
              </div>
            </Link>
          )}
        </div>
    </section>
  );
}

async function GameNews({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const game = await requireGame(gameSlugOrId);

  // Le fanion se lit avant la base : un jeu qui n'expose pas ses actualités
  // n'a pas à les faire lire, et la section disparaît sans requête.
  if (!game.features?.news) {
    return null;
  }

  // Le pilote Mongo touche à l'horloge en lisant les actualités, ce qu'un
  // prérendu ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const { news: latestNews } = await getNews({
    gameId: game.id,
    limit: 3,
    userId: session?.user?.id,
  });

  return (
    <GameNewsSection
      news={latestNews}
      gameSlug={game.slug ?? gameSlugOrId}
      isLoggedIn={!!session?.user?.id}
    />
  );
}

async function GameAgenda({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const game = await requireGame(gameSlugOrId);

  if (!game.featuredLairs || game.featuredLairs.length === 0) {
    return null;
  }

  // Le pilote Mongo touche à l'horloge en lisant les lieux, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const featuredLairs = await getLairsByIds(game.featuredLairs);
  if (featuredLairs.length === 0) {
    return null;
  }

  return (
    <FeaturedEventsAgenda
      featuredLairs={featuredLairs}
      gameName={game.name}
    />
  );
}

async function GameCommunity({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const [game, t] = await Promise.all([requireGame(gameSlugOrId), getTranslations("Games")]);

  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-bold text-white">{t("detail.communityTitle")}</h2>
      <div className="grid md:grid-cols-3 gap-6">
        <Link href={`/game-matches?gameId=${game.id}`} className="group">
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 backdrop-blur-sm rounded-xl border border-blue-500/20 p-8 hover:border-blue-500/50 transition-all hover:scale-105">
            <Users className="h-12 w-12 text-blue-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t("detail.communityMatches.title")}</h3>
            <p className="text-gray-300">{t("detail.communityMatches.description")}</p>
          </div>
        </Link>

        <Link href={`/events?gameId=${game.id}`} className="group">
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 backdrop-blur-sm rounded-xl border border-purple-500/20 p-8 hover:border-purple-500/50 transition-all hover:scale-105">
            <Calendar className="h-12 w-12 text-purple-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t("detail.communityEvents.title")}</h3>
            <p className="text-gray-300">{t("detail.communityEvents.description")}</p>
          </div>
        </Link>

        <Link href={`/lairs?gameId=${game.id}`} className="group">
          <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 backdrop-blur-sm rounded-xl border border-green-500/20 p-8 hover:border-green-500/50 transition-all hover:scale-105">
            <MapPin className="h-12 w-12 text-green-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t("detail.communityLairs.title")}</h3>
            <p className="text-gray-300">{t("detail.communityLairs.description")}</p>
          </div>
        </Link>
      </div>
    </section>
  );
}
