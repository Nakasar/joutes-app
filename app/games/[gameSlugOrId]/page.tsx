import { getGameBySlugOrId } from "@/lib/db/games";
import { getLairsByIds } from "@/lib/db/lairs";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GAME_TYPES } from "@/lib/constants/game-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar, Users, MapPin } from "lucide-react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";
import FollowGameButton from "./FollowGameButton";
import { FeaturedEventsAgenda } from "./FeaturedEventsAgenda";

interface GameDetailPageProps {
  params: Promise<{
    gameSlugOrId: string;
  }>;
}

export async function generateMetadata({ params }: GameDetailPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);

  if (!game) {
    return {
      title: "Jeu non trouvé - Joutes",
    };
  }

  return {
    title: `${game.name} - Joutes`,
    description: game.description,
    openGraph: {
      title: game.name,
      description: `Suivez les évènements ${game.name} autour de vous !`,
      images: game.banner ? [game.banner] : [],
    },
  };
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);

  if (!game) {
    notFound();
  }

  // Vérifier l'authentification et les jeux suivis
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  let isFollowing = false;
  if (session?.user?.id) {
    const user = await getUserById(session.user.id);
    isFollowing = user?.games?.includes(game.id) ?? false;
  }

  // Récupérer les lieux mis en avant pour ce jeu
  const featuredLairs = game.featuredLairs && game.featuredLairs.length > 0
    ? await getLairsByIds(game.featuredLairs)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
      {/* Hero Section avec Banner */}
      <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
        {/* Background Banner */}
        {game.banner ? (
          <div className="absolute inset-0">
            <img
              src={game.banner}
              alt={game.name}
              className="w-full h-full object-cover"
            />
            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-black" />
        )}

        {/* Back Button */}
        <div className="absolute top-8 left-8 z-20">
          <Link href="/games">
            <Button variant="secondary" className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour aux jeux
            </Button>
          </Link>
        </div>

        {/* Game Info */}
        <div className="absolute inset-0 flex items-end z-10">
          <div className="w-full max-w-7xl mx-auto px-8 pb-16 space-y-6">
            {/* Game Icon */}
            {game.icon && (
              <div className="w-32 h-32 rounded-lg overflow-hidden shadow-2xl border-4 border-white/20">
                <img
                  src={game.icon}
                  alt={game.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Title */}
            <h1 className="text-5xl md:text-7xl font-bold text-white drop-shadow-2xl animate-fade-in">
              {game.name}
            </h1>

            {/* Type Badge */}
            <div className="flex gap-3 items-center animate-fade-in animate-delay-100">
              <Badge variant="secondary" className="text-base px-4 py-2 bg-white/20 backdrop-blur-sm text-white border-white/30">
                {GAME_TYPES[game.type]}
              </Badge>
            </div>

            {/* Description */}
            <p className="text-xl text-gray-200 max-w-3xl leading-relaxed drop-shadow-lg animate-fade-in animate-delay-200">
              {game.description}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 animate-fade-in animate-delay-300">
              <FollowGameButton
                gameId={game.id}
                isFollowing={isFollowing}
                isAuthenticated={!!session?.user?.id}
              />
              <Link href={`/events?gameId=${game.id}`}>
                <Button size="lg" variant="secondary" className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70 px-8">
                  <Calendar className="h-5 w-5 mr-2" />
                  Voir les événements
                </Button>
              </Link>
              <Link href={`/lairs?gameId=${game.id}`}>
                <Button size="lg" variant="secondary" className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70 px-8">
                  <MapPin className="h-5 w-5 mr-2" />
                  Trouver un lieu
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Content Sections */}
      <div className="relative z-20 max-w-7xl mx-auto px-8 py-16 space-y-16">
        {/* À propos du jeu */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">À propos</h2>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-8">
            <p className="text-gray-300 text-lg leading-relaxed">
              {game.description}
            </p>

            <div className="grid md:grid-cols-3 gap-6 mt-8 pt-8 border-t border-white/10">
              <div>
                <h3 className="text-sm text-gray-400 uppercase tracking-wider mb-2">Type de jeu</h3>
                <p className="text-white text-lg font-semibold">{GAME_TYPES[game.type]}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Événements des lieux mis en avant */}
        {featuredLairs.length > 0 && (
          <FeaturedEventsAgenda
            featuredLairs={featuredLairs}
            gameName={game.name}
          />
        )}

        {/* Communauté - Placeholder pour futurs contenus */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Rejoignez la communauté</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href={`/game-matches?gameId=${game.id}`} className="group">
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 backdrop-blur-sm rounded-xl border border-blue-500/20 p-8 hover:border-blue-500/50 transition-all hover:scale-105">
                <Users className="h-12 w-12 text-blue-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Parties en cours</h3>
                <p className="text-gray-300">Rejoignez des parties ou créez la vôtre</p>
              </div>
            </Link>

            <Link href={`/events?gameId=${game.id}`} className="group">
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 backdrop-blur-sm rounded-xl border border-purple-500/20 p-8 hover:border-purple-500/50 transition-all hover:scale-105">
                <Calendar className="h-12 w-12 text-purple-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Événements</h3>
                <p className="text-gray-300">Découvrez les tournois et rencontres</p>
              </div>
            </Link>

            <Link href={`/lairs?gameId=${game.id}`} className="group">
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 backdrop-blur-sm rounded-xl border border-green-500/20 p-8 hover:border-green-500/50 transition-all hover:scale-105">
                <MapPin className="h-12 w-12 text-green-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Lieux de jeu</h3>
                <p className="text-gray-300">Trouvez des endroits pour jouer près de chez vous</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

