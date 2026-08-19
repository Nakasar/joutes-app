"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import { usePaginatedSearch } from "@/lib/use-paginated-search.ts";
import { PlayerShell } from "../PlayerShell.tsx";
import { usePlayerTournament } from "../usePlayerTournament.ts";
import { PlayerNameTag, playerTag } from "../../PlayerNameTag.tsx";
import { TablePagination } from "../../TablePagination.tsx";

type ApiMatch = {
  id: string;
  roundId: string;
  players: { playerId: string; score: number }[];
  winnerIds: string[];
  status: string;
};
type ApiRound = { id: string; number: number; status: string; phaseId: string; matches?: ApiMatch[] };

/**
 * Onglet « Tournoi » du portail joueur : où en est la journée (phases et
 * rondes), ce que le joueur a déjà joué, et qui participe. Répond aux questions
 * qu'on se pose entre deux matchs, quand l'écran « Mon match » n'a rien à dire.
 */
export default function TournamentPlayerInfoPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const t = useTranslations("Tournaments");
  const { tournamentId } = use(params);
  const { syncKey, tournament, myPlayerId, error, loading, apiFetch } =
    usePlayerTournament(tournamentId);

  const [rounds, setRounds] = useState<ApiRound[]>([]);
  const [myMatches, setMyMatches] = useState<{ round: number; opponent: string; label: string; outcome: string }[]>([]);

  const players = tournament?.players ?? [];
  const search = usePaginatedSearch(players, (p) => p.displayName, 25);

  useEffect(() => {
    if (!tournament || !myPlayerId) return;
    let cancelled = false;
    (async () => {
      const phases = [...tournament.phases].sort((a, b) => a.order - b.order);
      const collected: ApiRound[] = [];
      for (const phase of phases) {
        const res = await apiFetch(`/api/tournaments/${tournamentId}/phases/${phase.id}`);
        if (!res.ok) continue;
        const data = await res.json();
        for (const round of data.rounds ?? []) {
          collected.push({ ...round, phaseId: phase.id });
        }
      }
      if (cancelled) return;
      setRounds(collected);

      // Historique personnel : une ligne par ronde jouée. On ne charge le détail
      // que des rondes terminées, les seules qui portent un résultat.
      const played: { round: number; opponent: string; label: string; outcome: string }[] = [];
      for (const round of collected) {
        const res = await apiFetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`);
        if (!res.ok) continue;
        const data = await res.json();
        const match: ApiMatch | undefined = (data.matches ?? []).find((m: ApiMatch) =>
          m.players.some((p) => p.playerId === myPlayerId)
        );
        if (!match || match.status !== "completed") continue;
        const mine = match.players.find((p) => p.playerId === myPlayerId);
        const theirs = match.players.find((p) => p.playerId !== myPlayerId);
        const won = match.winnerIds.includes(myPlayerId);
        const drew = match.winnerIds.length === 0;
        played.push({
          round: round.number,
          opponent: theirs
            ? (() => {
                const player = players.find((p) => p.id === theirs.playerId);
                return player
                  ? playerTag(player.displayName, player.discriminator)
                  : t("player.unknownPlayer");
              })()
            : t("common.bye"),
          label: `${mine?.score ?? 0}–${theirs?.score ?? 0}`,
          outcome: won ? "win" : drew ? "draw" : "loss",
        });
      }
      if (!cancelled) setMyMatches(played);
    })();
    return () => {
      cancelled = true;
    };
    // `players` dérive de `tournament` : l'inclure relancerait la boucle à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament, myPlayerId, apiFetch, tournamentId, t]);

  const completedRounds = rounds.filter((r) => r.status === "completed");
  const currentRound = rounds.find((r) => r.status === "in-progress");

  return (
    <PlayerShell
      tournamentId={tournamentId}
      active="players"
      tournament={tournament}
      syncKey={syncKey}
      myPlayerId={myPlayerId}
      loading={loading}
      error={error}
    >
      <div className="space-y-4">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2.5 text-[15px] font-semibold">{t("player.progressTitle")}</h2>
          <ul className="flex flex-col gap-2.5 text-[13px]">
            {completedRounds.length > 0 && (
              <li className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">
                  {t("player.roundsCompleted", { count: completedRounds.length })}
                </span>
              </li>
            )}
            {currentRound && (
              <li className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-sky-500" />
                <span className="font-semibold">
                  {t("player.roundInProgress", { number: currentRound.number })}
                </span>
              </li>
            )}
            {rounds.length === 0 && (
              <li className="text-muted-foreground">{t("player.noRoundsYet")}</li>
            )}
          </ul>
        </section>

        {myMatches.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-1.5 text-[15px] font-semibold">{t("player.myMatchesTitle")}</h2>
            <ul className="divide-y">
              {myMatches.map((match) => (
                <li key={match.round} className="flex justify-between gap-3 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate">
                    R{match.round} · {match.opponent}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      match.outcome === "win"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : match.outcome === "loss"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    )}
                  >
                    {t(`playerSheet.outcome.${match.outcome}`)} {match.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2.5 text-[15px] font-semibold">{t("player.playersTitle")}</h2>
          {players.length > 0 ? (
            <div className="space-y-3">
              <Input
                value={search.query}
                onChange={(e) => search.setQuery(e.target.value)}
                placeholder={t("player.searchPlaceholder")}
              />
              <ul className="divide-y">
                {search.pageItems.map((player) => (
                  <li key={player.id} className="flex items-center justify-between py-2">
                    <span className={player.id === myPlayerId ? "font-semibold" : ""}>
                      <PlayerNameTag name={player.displayName} discriminator={player.discriminator} />
                      {player.id === myPlayerId ? ` ${t("player.me")}` : ""}
                    </span>
                    {player.status === "dropped" && (
                      <Badge variant="outline">{t("player.dropBadge")}</Badge>
                    )}
                  </li>
                ))}
                {search.pageItems.length === 0 && (
                  <li className="py-2 text-sm text-muted-foreground">{t("player.noSearchResults")}</li>
                )}
              </ul>
              <TablePagination
                page={search.page}
                totalPages={search.totalPages}
                total={search.total}
                onPage={search.setPage}
              />
            </div>
          ) : (
            <p className="text-muted-foreground">{t("player.noPlayers")}</p>
          )}
        </section>
      </div>
    </PlayerShell>
  );
}
