import { useTranslations } from "next-intl";
import type { TournamentResultMode } from "@/lib/types/Tournament.ts";
import type { MatchExportEntry } from "@/lib/tournaments/match-export.ts";

/**
 * Une feuille de match à remplir à la main : en-tête d'identification, grille
 * des parties du best-of, résultat final et signatures.
 *
 * Deux feuilles tiennent sur une page A4 : la coupure est posée après chaque
 * feuille paire, et chaque feuille reste insécable.
 */
export function MatchSheet({
  entry,
  tournamentName,
  phaseName,
  roundNumber,
  bestOf,
  resultMode,
}: {
  entry: MatchExportEntry;
  tournamentName: string;
  phaseName: string;
  roundNumber: number;
  bestOf: number;
  resultMode: TournamentResultMode;
}) {
  const t = useTranslations("Tournaments");
  const games = Array.from({ length: Math.max(1, bestOf) }, (_, index) => index + 1);

  return (
    <section className="mb-6 break-inside-avoid border-2 border-black p-4 [&:nth-child(2n)]:break-after-page">
      <header className="flex items-start justify-between gap-4 border-b border-black pb-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">{tournamentName}</p>
          <p className="text-sm">
            {phaseName} · {t("matchExport.roundLabel", { number: roundNumber })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-wide">{t("matchExport.columns.table")}</p>
          <p className="text-3xl font-black leading-none">{entry.tableNumber ?? "—"}</p>
        </div>
      </header>

      {/* Grille des parties : une ligne par partie du best-of, une colonne par joueur. */}
      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-24 border border-black p-1 text-left font-semibold">
              {resultMode === "points" ? t("matchExport.sheet.points") : t("matchExport.sheet.game")}
            </th>
            {entry.players.map((player) => (
              <th key={player.id} className="border border-black p-1 text-left font-semibold">
                {player.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <tr key={game}>
              <td className="border border-black p-1">{t("matchExport.sheet.gameNumber", { number: game })}</td>
              {entry.players.map((player) => (
                <td key={player.id} className="h-8 border border-black p-1" />
              ))}
            </tr>
          ))}
          <tr>
            <td className="border border-black p-1 font-semibold">{t("matchExport.sheet.gamesWon")}</td>
            {entry.players.map((player) => (
              <td key={player.id} className="h-8 border border-black p-1" />
            ))}
          </tr>
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 text-sm">
        <p className="grow">
          {t("matchExport.sheet.winner")} <span className="inline-block w-56 border-b border-black" />
        </p>
        {entry.players.map((player) => (
          <p key={player.id} className="grow">
            {t("matchExport.sheet.signature", { name: player.label })}{" "}
            <span className="inline-block w-32 border-b border-black" />
          </p>
        ))}
      </div>
    </section>
  );
}
