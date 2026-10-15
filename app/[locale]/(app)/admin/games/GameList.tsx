"use client";

import { useState, useTransition } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Game } from "@/lib/types/Game.ts";
import { deleteGame } from "./actions.ts";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { GAME_TYPES } from "@/lib/constants/game-types.ts";
import { GAME_FEATURE_KEYS } from "@/lib/constants/game-features.ts";

/**
 * Les jeux en cartes : l'icône, le type et le nombre de fonctionnalités actives
 * se lisent d'un coup d'œil, et la carte entière mène à la fiche.
 */
export function GameList({ games }: { games: Game[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null);

  const needle = query.trim().toLocaleLowerCase("fr");
  const shown = games
    .filter((game) => !needle || `${game.name} ${game.slug ?? ""}`.toLocaleLowerCase("fr").includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const remove = (game: Game) => {
    startTransition(async () => {
      const result = await deleteGame(game.id);
      if (!result.success) {
        toast.error(result.error || "Erreur lors de la suppression du jeu");
        return;
      }
      toast.success(`${game.name} supprimé.`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <label className="flex h-11 max-w-md items-center gap-2 rounded-lg border border-border bg-card px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Rechercher un jeu</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom ou slug"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
          {games.length === 0 ? "Aucun jeu pour le moment." : "Aucun jeu ne correspond à cette recherche."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((game) => {
            const enabled = GAME_FEATURE_KEYS.filter((key) => game.features?.[key] === true).length;
            const href = `/admin/games/${game.slug ?? game.id}`;
            return (
              <li
                key={game.id}
                className="group relative flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                {game.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={game.icon} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-xl font-bold text-white dark:bg-sky-500">
                    {game.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Le lien couvre toute la carte ; le bouton de suppression passe au-dessus. */}
                  <Link href={href} className="truncate font-semibold after:absolute after:inset-0 after:rounded-2xl">
                    {game.name}
                  </Link>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                      {GAME_TYPES[game.type] ?? "Autre"}
                    </span>
                    <span>
                      {enabled} fonctionnalité{enabled > 1 ? "s" : ""} active{enabled > 1 ? "s" : ""}
                    </span>
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative z-10 size-10 text-muted-foreground hover:text-destructive"
                  aria-label={`Supprimer ${game.name}`}
                  title="Supprimer le jeu"
                  onClick={() => setGameToDelete(game)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!gameToDelete}
        onOpenChange={(open) => {
          if (!open) setGameToDelete(null);
        }}
        title={`Supprimer ${gameToDelete?.name ?? "ce jeu"} ?`}
        description="Le jeu disparaît du catalogue. On ne pourra pas revenir en arrière."
        confirmLabel="Supprimer"
        destructive
        busy={isPending}
        onConfirm={() => {
          if (gameToDelete) remove(gameToDelete);
          setGameToDelete(null);
        }}
      />
    </div>
  );
}
