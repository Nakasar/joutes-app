"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePaginatedSearch } from "@/lib/use-paginated-search";
import { PlayerShell } from "../PlayerShell";
import { usePlayerTournament } from "../usePlayerTournament";
import { PlayerNameTag } from "../../PlayerNameTag";
import { TablePagination } from "../../TablePagination";

export default function TournamentPlayerPlayersPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const t = useTranslations("Tournaments");
  const { tournamentId } = use(params);
  const { syncKey, tournament, myPlayerId, error, loading } = usePlayerTournament(tournamentId);

  const players = tournament?.players ?? [];
  const search = usePaginatedSearch(players, (p) => p.displayName, 25);

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
      <Card>
        <CardHeader>
          <CardTitle>{t("player.playersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {players.length > 0 ? (
            <div className="space-y-3">
              <Input
                value={search.query}
                onChange={(e) => search.setQuery(e.target.value)}
                placeholder={t("player.searchPlaceholder")}
                className="max-w-xs"
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
                  <li className="py-2 text-sm text-muted-foreground">
                    {t("player.noSearchResults")}
                  </li>
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
        </CardContent>
      </Card>
    </PlayerShell>
  );
}
