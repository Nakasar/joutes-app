"use client";

import { useMemo, useState, useTransition } from "react";
import { Game } from "@/lib/types/Game.ts";
import { Lair } from "@/lib/types/Lair.ts";
import { Button } from "@/components/ui/button.tsx";
import { updateLairGames } from "../actions.ts";

const FIELD_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

/**
 * Les jeux qu'un lieu déclare.
 *
 * Un filtre plutôt qu'une liste à défilement enfermée dans 12 rem : sur une
 * page, les jeux tiennent en grille, et chercher « lor » vaut mieux que faire
 * défiler un catalogue qui n'a pas vocation à rester court.
 */
export function LairGamesForm({ lair, games }: { lair: Lair; games: Game[] }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string[]>(lair.games ?? []);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle === ""
      ? games
      : games.filter((game) => game.name.toLowerCase().includes(needle));
  }, [games, search]);

  const toggle = (gameId: string) => {
    setSelected((previous) =>
      previous.includes(gameId)
        ? previous.filter((id) => id !== gameId)
        : [...previous, gameId],
    );
  };

  const submit = () => {
    setMessage(null);

    startTransition(async () => {
      const result = await updateLairGames(lair.id, selected);

      setMessage(
        result.success
          ? { ok: true, text: "Jeux enregistrés." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Jeux supportés</h2>
          <p className="text-sm text-muted-foreground">
            Ce que le lieu déclare jouer. Un jeu coché fait apparaître le lieu dans la recherche de
            ce jeu, et le rend éligible à sa mise en avant.
          </p>
        </div>

        {games.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun jeu disponible. Ajoutez-en d&apos;abord dans la section Jeux.
          </p>
        ) : (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer les jeux…"
              aria-label="Filtrer les jeux"
              className={`${FIELD_CLASS} sm:max-w-sm`}
            />

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun jeu ne correspond au filtre.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((game) => (
                  <label
                    key={game.id}
                    className="flex items-center gap-2 rounded-lg border border-input p-3 cursor-pointer hover:border-blue-500"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(game.id)}
                      onChange={() => toggle(game.id)}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 text-sm text-foreground truncate">{game.name}</span>
                  </label>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {selected.length} jeu{selected.length > 1 ? "x" : ""} déclaré
              {selected.length > 1 ? "s" : ""}.
            </p>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les jeux"}
        </Button>
      </div>
    </div>
  );
}
