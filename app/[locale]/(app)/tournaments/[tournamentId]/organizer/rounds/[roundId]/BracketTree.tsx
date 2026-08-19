import { Link } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils.ts";
import { compareBracketPositions } from "@/lib/utils/pairing.ts";
import type { TournamentMatch, TournamentRound } from "@/lib/types/Tournament.ts";
import { PlayerNameTag } from "../../../PlayerNameTag.tsx";

type BracketPlayer = { id: string; displayName: string; discriminator?: string };

// Dimensions fixes (px) : le placement des matchs et des connecteurs SVG est
// calculé à partir de ces constantes, dans un conteneur à défilement horizontal.
const MATCH_W = 232;
const MATCH_H = 76;
const COL_GAP = 48;
const ROW_GAP = 20;
const HEADER_H = 48;
const BASE_SLOT = MATCH_H + ROW_GAP;

// Libellé du tour selon le nombre de matchs restants dans la colonne.
function stageLabel(
  t: ReturnType<typeof useTranslations>,
  slotCount: number,
  columnIndex: number
): string {
  switch (slotCount) {
    case 1:
      return t("bracketTree.final");
    case 2:
      return t("bracketTree.semiFinals");
    case 4:
      return t("bracketTree.quarterFinals");
    case 8:
      return t("bracketTree.roundOf16");
    case 16:
      return t("bracketTree.roundOf32");
    default:
      return t("common.roundN", { number: columnIndex + 1 });
  }
}

// Ordre des matchs d'une ronde de bracket : reflète generateNextBracketRound
// (même comparateur de bracketPosition) pour que les vainqueurs des matchs
// 2i et 2i+1 alimentent bien le match i de la colonne suivante.
function sortBracketMatches(matches: TournamentMatch[]): TournamentMatch[] {
  return [...matches].sort((a, b) =>
    compareBracketPositions(
      { matchId: a.id, bracketPosition: a.bracketPosition },
      { matchId: b.id, bracketPosition: b.bracketPosition }
    )
  );
}

/**
 * Arbre d'élimination d'une phase « bracket » : une colonne par tour, un
 * emplacement par match (les matchs pas encore générés apparaissent « À
 * déterminer »), et des connecteurs SVG qui matérialisent le parcours des
 * joueurs de match en match jusqu'à la finale.
 */
export function BracketTree({
  tournamentId,
  rounds,
  matches,
  players,
  currentRoundId,
}: {
  tournamentId: string;
  rounds: TournamentRound[];
  matches: TournamentMatch[];
  players: BracketPlayer[];
  currentRoundId?: string;
}) {
  const t = useTranslations("Tournaments");
  const sortedRounds = [...rounds].sort((a, b) => a.number - b.number);
  const matchesByRound = new Map<string, TournamentMatch[]>();
  for (const round of sortedRounds) {
    matchesByRound.set(
      round.id,
      sortBracketMatches(matches.filter((m) => m.roundId === round.id))
    );
  }
  const playersById = new Map(players.map((p) => [p.id, p]));

  const firstRoundSlots = matchesByRound.get(sortedRounds[0]?.id ?? "")?.length ?? 0;
  if (firstRoundSlots === 0) {
    return (
      <p className="text-muted-foreground">{t("bracketTree.emptyHint")}</p>
    );
  }

  // Nombre total de tours jusqu'à la finale (les tours non encore joués sont
  // affichés en pointillés), et nombre d'emplacements attendus par colonne.
  const totalColumns = Math.max(
    sortedRounds.length,
    Math.max(1, Math.ceil(Math.log2(firstRoundSlots)) + 1)
  );
  const columns = Array.from({ length: totalColumns }, (_, c) => {
    const round = sortedRounds[c];
    const roundMatches = round ? matchesByRound.get(round.id) ?? [] : [];
    const expected = Math.max(1, Math.ceil(firstRoundSlots / 2 ** c));
    const slotCount = Math.max(expected, roundMatches.length);
    return {
      round,
      slotCount,
      slots: Array.from({ length: slotCount }, (_, i) => roundMatches[i] ?? null),
    };
  });

  const width = totalColumns * MATCH_W + (totalColumns - 1) * COL_GAP;
  const height = HEADER_H + firstRoundSlots * BASE_SLOT;
  const x = (c: number) => c * (MATCH_W + COL_GAP);
  const yCenter = (c: number, i: number) => HEADER_H + BASE_SLOT * 2 ** c * (i + 0.5);

  // Connecteurs en coude entre chaque match (colonne c, emplacement 2i / 2i+1)
  // et le match qu'alimentent ses vainqueurs (colonne c+1, emplacement i).
  const connectors: string[] = [];
  for (let c = 0; c < totalColumns - 1; c++) {
    const midX = x(c) + MATCH_W + COL_GAP / 2;
    for (let i = 0; i < columns[c + 1].slotCount; i++) {
      for (const childIndex of [2 * i, 2 * i + 1]) {
        if (childIndex >= columns[c].slotCount) continue;
        connectors.push(
          `M ${x(c) + MATCH_W} ${yCenter(c, childIndex)} H ${midX} V ${yCenter(c + 1, i)} H ${x(c + 1)}`
        );
      }
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden="true"
        >
          {connectors.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              className="stroke-muted-foreground/40"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {columns.map((column, c) => {
          const isCurrent = !!column.round && column.round.id === currentRoundId;
          const header = (
            <>
              <p className={cn("truncate text-sm font-semibold", isCurrent && "text-primary")}>
                {stageLabel(t, column.slotCount, c)}
              </p>
              <p className="text-xs text-muted-foreground">
                {column.round
                  ? t("common.roundN", { number: column.round.number })
                  : t("bracketTree.upcoming")}
              </p>
            </>
          );
          return (
            <div key={c}>
              {column.round ? (
                <Link
                  href={`/tournaments/${tournamentId}/organizer/rounds/${column.round.id}/matches`}
                  className="absolute block hover:opacity-80"
                  style={{ left: x(c), top: 0, width: MATCH_W }}
                >
                  {header}
                </Link>
              ) : (
                <div className="absolute" style={{ left: x(c), top: 0, width: MATCH_W }}>
                  {header}
                </div>
              )}

              {column.slots.map((match, i) => {
                const style = {
                  left: x(c),
                  top: yCenter(c, i) - MATCH_H / 2,
                  width: MATCH_W,
                  height: MATCH_H,
                };
                if (!match) {
                  return (
                    <div
                      key={i}
                      className="absolute flex items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground"
                      style={style}
                    >
                      {t("bracketTree.toBeDetermined")}
                    </div>
                  );
                }
                return (
                  <Link
                    key={match.id}
                    href={`/tournaments/${tournamentId}/organizer/rounds/${match.roundId}/matches`}
                    className="absolute flex flex-col justify-center gap-1 overflow-hidden rounded-lg border bg-card px-2 py-1.5 text-sm shadow-sm transition-colors hover:bg-accent"
                    style={style}
                  >
                    {match.players.map(({ playerId, score }) => {
                      const player = playersById.get(playerId);
                      const isWinner =
                        match.status === "completed" && match.winnerIds.includes(playerId);
                      return (
                        <span
                          key={playerId}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded px-1",
                            isWinner &&
                              "bg-amber-100 font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                          )}
                        >
                          <PlayerNameTag
                            name={player?.displayName ?? t("bracketTree.unknownPlayer")}
                            discriminator={player?.discriminator}
                            className="truncate"
                          />
                          {match.status !== "pending" && (
                            <span className="shrink-0 tabular-nums text-xs">{score}</span>
                          )}
                        </span>
                      );
                    })}
                    {match.players.length === 1 && (
                      <span className="px-1 text-xs italic text-muted-foreground">
                        {t("bracketTree.byeAutoWin")}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
