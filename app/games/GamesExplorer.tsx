"use client";

import { useState, useMemo } from "react";
import { Game } from "@/lib/types/Game";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GAME_TYPES } from "@/lib/constants/game-types";

interface GamesExplorerProps {
  games: Game[];
}

export default function GamesExplorer({ games }: GamesExplorerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) {
      return games;
    }

    const query = searchQuery.toLowerCase();
    return games.filter((game) =>
      game.name.toLowerCase().includes(query) ||
      game.description.toLowerCase().includes(query)
    );
  }, [games, searchQuery]);

  // Grouper les jeux par type
  const gamesByType = useMemo(() => {
    const grouped: Record<string, Game[]> = {};

    filteredGames.forEach((game) => {
      const typeLabel = GAME_TYPES[game.type] || "Autre";
      if (!grouped[typeLabel]) {
        grouped[typeLabel] = [];
      }
      grouped[typeLabel].push(game);
    });

    return grouped;
  }, [filteredGames]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
      {/* Hero Section avec barre de recherche */}
      <div className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black z-10" />

        {/* Background pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        {/* Content */}
        <div className="relative z-20 w-full max-w-4xl px-4 space-y-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 animate-fade-in">
            Explorez les Jeux
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 animate-fade-in animate-delay-100">
            Découvrez des jeux de cartes et de plateau exceptionnels pour tous les goûts.
          </p>

          {/* Search Bar */}
          <div className="relative max-w-2xl mx-auto animate-fade-in animate-delay-200">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Rechercher un jeu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-lg bg-black/50 border-gray-700 text-white placeholder:text-gray-400 focus:border-white focus:ring-white/50"
            />
          </div>

          {searchQuery && (
            <p className="text-gray-400 animate-fade-in">
              {filteredGames.length} jeu{filteredGames.length > 1 ? "x" : ""} trouvé{filteredGames.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Games Grid by Category */}
      <div className="relative z-20 px-4 md:px-8 pb-20 -mt-20">
        {Object.entries(gamesByType).length === 0 ? (
          <div className="text-center py-20">
            <p className="text-2xl text-gray-400">Aucun jeu trouvé</p>
            <p className="text-gray-500 mt-2">Essayez une autre recherche</p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.entries(gamesByType).map(([type, gamesInType]) => (
              <section key={type} className="space-y-6">
                <h2 className="text-3xl font-bold text-white px-4">{type}</h2>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {gamesInType.map((game) => (
                    <Link
                      key={game.id}
                      href={`/games/${game.slug || game.id}`}
                      className="group relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 transition-all duration-300 hover:scale-105 hover:z-10 hover:ring-2 hover:ring-white"
                    >
                      {/* Game Banner/Icon */}
                      {game.banner || game.icon ? (
                        <div className="absolute inset-0">
                          <img
                            src={game.banner || game.icon}
                            alt={game.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                          <span className="text-6xl opacity-20">🎮</span>
                        </div>
                      )}

                      {/* Game Info Overlay */}
                      <div className="absolute inset-0 flex flex-col justify-end p-4 opacity-100 group-hover:opacity-100 transition-opacity">
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        <h3 className="text-white font-bold text-lg mb-2 line-clamp-2 drop-shadow-lg">
                          {game.name}
                        </h3>

                        {/* Type Badge */}
                        <Badge variant="secondary" className="w-fit text-xs bg-white/20 backdrop-blur-sm text-white border-white/30">
                          {GAME_TYPES[game.type]}
                        </Badge>

                        {/* Description (visible on hover) */}
                        <p className="text-gray-300 text-sm mt-2 line-clamp-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg">
                          {game.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

