import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Gamepad2 } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import type { Game } from "@/lib/types/Game";

/**
 * L'onglet « Jeux joués ici ».
 *
 * Les mêmes vignettes que la page actuelle, mais en grille plutôt qu'en
 * carrousel : sur un onglet dédié, un défilement horizontal cacherait la
 * moitié du catalogue derrière un geste.
 *
 * Chaque vignette porte le nombre d'événements à venir sur ce jeu — la
 * différence entre un jeu que le lieu vend et un jeu qu'on peut venir y jouer.
 */
export default async function LairGamesTab({
  games,
  upcomingByGame,
}: {
  games: Game[];
  upcomingByGame: Record<string, number>;
}) {
  const t = await getTranslations("Lairs.portal.games");

  if (games.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2.5 text-[22px] font-bold">
          <Gamepad2 className="size-[22px]" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-[13px] text-muted-foreground">{t("count", { count: games.length })}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((game) => {
          const banner = game.banner ?? game.images?.banner ?? game.images?.horizontal;
          const icon = game.icon ?? game.images?.icon;
          const upcoming = upcomingByGame[game.name] ?? 0;

          return (
            <Link
              key={game.id}
              href={`/games/${game.slug ?? game.id}`}
              className="group relative block h-48 overflow-hidden rounded-xl border bg-muted shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
              // Sans bannière, la couleur du jeu tient lieu de fond : c'est
              // celle qui le désigne partout ailleurs dans Joutes, et un
              // dégradé générique rendrait toutes les vignettes identiques.
              style={game.color ? { backgroundColor: game.color } : undefined}
            >
              {banner && (
                <Image
                  src={banner}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 400px"
                />
              )}

              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-black/85 via-black/40 to-transparent transition-colors duration-300 group-hover:from-black/90"
              />

              <span className="relative flex h-full flex-col justify-between p-5">
                <span className="flex items-start justify-between gap-3">
                  {icon && (
                    <Image
                      src={icon}
                      alt=""
                      width={56}
                      height={56}
                      className="size-14 rounded-lg bg-white/10 object-contain p-1.5 backdrop-blur-sm"
                    />
                  )}
                  {upcoming > 0 && (
                    <span className="rounded-full bg-[var(--lair-accent-20)] px-2 py-0.5 font-mono text-[11px] text-[var(--lair-accent-text)]">
                      {t("upcoming", { count: upcoming })}
                    </span>
                  )}
                </span>

                <span className="flex flex-col gap-2">
                  <span className="text-2xl font-bold text-white drop-shadow-lg">{game.name}</span>
                  <span>
                    <Badge
                      variant="secondary"
                      className="border-white/30 bg-white/20 text-white backdrop-blur-sm"
                    >
                      {game.type}
                    </Badge>
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
