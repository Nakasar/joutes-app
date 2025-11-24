"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Edit, Trash2 } from "lucide-react";
import type { MatchResult } from "@/lib/schemas/event-portal.schema";

type BracketViewProps = {
  matches: MatchResult[];
  getParticipantName?: (id: string | null) => string;
  onEditMatch?: (match: MatchResult) => void;
  onDeleteMatch?: (matchId: string) => void;
  readonly?: boolean;
};

type BracketRound = {
  round: number;
  matches: (MatchResult | null)[];
  label: string;
};

export default function BracketView({
  matches,
  getParticipantName,
  onEditMatch,
  onDeleteMatch,
  readonly = false,
}: BracketViewProps) {
  // Fonction helper pour obtenir le nom d'un joueur
  const getPlayerName = (match: MatchResult, playerId: string | null): string => {
    if (playerId === null) return "BYE";
    
    // Si une fonction getParticipantName est fournie, l'utiliser (mode organisateur)
    if (getParticipantName) {
      return getParticipantName(playerId);
    }
    
    // Sinon, utiliser les noms pré-chargés dans le match (mode joueur)
    if (playerId === match.player1Id && match.player1Name) {
      return match.player1Name;
    }
    if (playerId === match.player2Id && match.player2Name) {
      return match.player2Name;
    }
    
    return `Joueur ${playerId.slice(-4)}`;
  };
  
  // Calculer le nombre total de rondes nécessaires basé sur les matchs de la première ronde
  const firstRoundMatches = matches.filter(m => (m.round || 1) === 1);
  const numFirstRoundMatches = firstRoundMatches.length;
  
  // Si pas de matchs, ne rien afficher
  if (numFirstRoundMatches === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Aucun match dans cette phase
      </div>
    );
  }
  
  // Calculer le nombre total de rondes (log2 du nombre de matchs de R1)
  const totalRounds = Math.ceil(Math.log2(numFirstRoundMatches)) + 1;
  
  // Organiser les matchs existants par ronde
  const matchesByRound = new Map<number, MatchResult[]>();
  matches.forEach((match) => {
    const round = match.round || 1;
    if (!matchesByRound.has(round)) {
      matchesByRound.set(round, []);
    }
    matchesByRound.get(round)!.push(match);
  });

  // Construire toutes les rondes avec cases vides pour matchs futurs
  const allRounds: BracketRound[] = [];
  for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
    // Calculer le nombre de matchs attendus pour cette ronde
    const expectedMatches = Math.ceil(numFirstRoundMatches / Math.pow(2, roundNum - 1));
    
    const existingMatches = matchesByRound.get(roundNum) || [];
    const roundMatches: (MatchResult | null)[] = [];
    
    // Ajouter les matchs existants et remplir avec null pour les matchs futurs
    for (let i = 0; i < expectedMatches; i++) {
      roundMatches.push(existingMatches[i] || null);
    }
    
    // Trier les matchs non-null par bracketPosition
    const sortedMatches = roundMatches.map(m => m).sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      const posA = a.bracketPosition || a.matchId;
      const posB = b.bracketPosition || b.matchId;
      return posA.localeCompare(posB);
    });
    
    allRounds.push({
      round: roundNum,
      matches: sortedMatches,
      label: getRoundLabel(roundNum, totalRounds),
    });
  }
  
  const sortedRounds = allRounds;

  function getRoundLabel(round: number, totalRounds: number): string {
    const roundsFromEnd = totalRounds - round + 1;
    
    if (roundsFromEnd === 1) return "Finale";
    if (roundsFromEnd === 2) return "Demi-finales";
    if (roundsFromEnd === 3) return "Quarts de finale";
    if (roundsFromEnd === 4) return "Huitièmes de finale";
    
    return `Ronde ${round}`;
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
              {bracketRound.matches.map((match, idx) => {
                // Si le match n'existe pas encore, afficher une case vide
                if (!match) {
                  return (
                    <Card key={`empty-${bracketRound.round}-${idx}`} className="p-4 bg-muted/30">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            À venir
                          </Badge>
                        </div>
                        <div className="flex items-center justify-center p-2 rounded bg-muted/50 text-muted-foreground">
                          <span className="text-sm">Vainqueur du match précédent</span>
                        </div>
                        <div className="flex items-center justify-center p-2 rounded bg-muted/50 text-muted-foreground">
                          <span className="text-sm">Vainqueur du match précédent</span>
                        </div>
                      </div>
                    </Card>
                  );
                }

                // Afficher le match normal
                return (
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
                          {getPlayerName(match, match.player1Id)}
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
                            {getPlayerName(match, match.player2Id)}
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
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
