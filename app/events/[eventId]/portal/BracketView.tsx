"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Edit, Trash2 } from "lucide-react";
import type { MatchResult } from "@/lib/schemas/event-portal.schema";

type BracketViewProps = {
  matches: MatchResult[];
  getParticipantName: (id: string | null) => string;
  onEditMatch?: (match: MatchResult) => void;
  onDeleteMatch?: (matchId: string) => void;
  readonly?: boolean;
};

type BracketRound = {
  round: number;
  matches: MatchResult[];
  label: string;
};

export default function BracketView({
  matches,
  getParticipantName,
  onEditMatch,
  onDeleteMatch,
  readonly = false,
}: BracketViewProps) {
  // Organiser les matchs par ronde
  const rounds = new Map<number, MatchResult[]>();
  matches.forEach((match) => {
    const round = match.round || 1;
    if (!rounds.has(round)) {
      rounds.set(round, []);
    }
    rounds.get(round)!.push(match);
  });

  // Convertir en tableau et trier par ronde (ordre décroissant pour afficher de droite à gauche)
  const sortedRounds: BracketRound[] = Array.from(rounds.entries())
    .sort(([a], [b]) => b - a) // Inverser l'ordre pour afficher finale à droite
    .map(([round, roundMatches]) => ({
      round,
      matches: roundMatches.sort((a, b) => {
        // Trier par bracketPosition si disponible, sinon par matchId
        const posA = a.bracketPosition || a.matchId;
        const posB = b.bracketPosition || b.matchId;
        return posA.localeCompare(posB);
      }),
      label: getRoundLabel(round, rounds.size),
    }));

  function getRoundLabel(round: number, totalRounds: number): string {
    const roundsFromEnd = totalRounds - round + 1;
    
    if (roundsFromEnd === 1) return "Finale";
    if (roundsFromEnd === 2) return "Demi-finales";
    if (roundsFromEnd === 3) return "Quarts de finale";
    if (roundsFromEnd === 4) return "Huitièmes de finale";
    
    return `Ronde ${round}`;
  }

  if (matches.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Aucun match dans cette phase
      </div>
    );
  }

  return (
    <div className="bracket-container overflow-x-auto pb-4">
      <div className="flex gap-8 items-start justify-end min-w-max">
        {sortedRounds.map((bracketRound) => (
          <div key={bracketRound.round} className="flex flex-col gap-4 min-w-[280px]">
            <h3 className="text-lg font-semibold text-center mb-2">
              {bracketRound.label}
            </h3>
            <div 
              className="flex flex-col gap-4"
              style={{
                justifyContent: "center",
              }}
            >
              {bracketRound.matches.map((match) => (
                <Card key={match.matchId} className="p-4 hover:shadow-lg transition-shadow">
                  <div className="space-y-3">
                    {/* En-tête avec position et statut */}
                    <div className="flex items-center justify-between">
                      {match.bracketPosition && (
                        <Badge variant="outline" className="text-xs">
                          {match.bracketPosition}
                        </Badge>
                      )}
                      <Badge
                        variant={
                          match.status === "completed"
                            ? "default"
                            : match.status === "in-progress"
                            ? "secondary"
                            : "outline"
                        }
                        className="ml-auto"
                      >
                        {match.status === "pending" && "En attente"}
                        {match.status === "in-progress" && "En cours"}
                        {match.status === "completed" && "Terminé"}
                        {match.status === "disputed" && "Contesté"}
                      </Badge>
                    </div>

                    {/* Joueur 1 */}
                    <div
                      className={`flex items-center justify-between p-2 rounded ${
                        match.winnerId === match.player1Id
                          ? "bg-green-100 dark:bg-green-900/30 font-semibold"
                          : "bg-muted/50"
                      }`}
                    >
                      <span className="truncate flex-1">
                        {getParticipantName(match.player1Id)}
                      </span>
                      <span className="ml-2 font-bold text-lg">
                        {match.player1Score}
                      </span>
                    </div>

                    {/* Joueur 2 ou BYE */}
                    {match.player2Id ? (
                      <div
                        className={`flex items-center justify-between p-2 rounded ${
                          match.winnerId === match.player2Id
                            ? "bg-green-100 dark:bg-green-900/30 font-semibold"
                            : "bg-muted/50"
                        }`}
                      >
                        <span className="truncate flex-1">
                          {getParticipantName(match.player2Id)}
                        </span>
                        <span className="ml-2 font-bold text-lg">
                          {match.player2Score}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-2 rounded bg-muted/30 text-muted-foreground italic">
                        BYE
                      </div>
                    )}

                    {/* Actions (si pas readonly) */}
                    {!readonly && (onEditMatch || onDeleteMatch) && (
                      <div className="flex gap-2 pt-2 border-t">
                        {onEditMatch && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditMatch(match)}
                            className="flex-1"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Modifier
                          </Button>
                        )}
                        {onDeleteMatch && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDeleteMatch(match.matchId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
