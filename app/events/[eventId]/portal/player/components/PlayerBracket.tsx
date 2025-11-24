import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BracketView from "../../BracketView";

type PlayerBracketProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  matches: MatchResult[];
  participants: any[];
};

export default function PlayerBracket({ event, settings, userId, matches, participants }: PlayerBracketProps) {
  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);

  const getPlayerName = (playerId: string | null): string => {
    if (playerId === null) return "BYE";
    if (playerId === userId) return "Vous";
    
    // Chercher dans les matchs pour obtenir le nom pré-chargé
    for (const match of matches) {
      if (match.player1Id === playerId && match.player1Name) {
        return match.player1Name;
      }
      if (match.player2Id === playerId && match.player2Name) {
        return match.player2Name;
      }
    }
    
    return `Joueur ${playerId.slice(-4)}`;
  };

  if (!currentPhase || currentPhase.type !== "bracket") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Aucune phase bracket en cours
          </p>
        </CardContent>
      </Card>
    );
  }

  const phaseMatches = matches.filter(m => m.phaseId === currentPhase.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bracket - {currentPhase.name}</CardTitle>
          <CardDescription>
            Visualisez l&apos;arbre d&apos;élimination directe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {phaseMatches.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Aucun match généré pour le bracket
            </p>
          ) : (
            <BracketView
              matches={phaseMatches}
              getParticipantName={getPlayerName}
              readonly={true}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
