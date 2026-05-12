import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BracketView from "../../BracketView";

type EventParticipant = {
  id: string;
  username?: string;
  discriminator?: string;
  email?: string;
  profileImage?: string;
  type: string;
  registrationStatus: string;
};

type PlayerBracketProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  matches: MatchResult[];
  participants: EventParticipant[];
};

export default function PlayerBracket({ event, settings, userId, matches, participants }: PlayerBracketProps) {
  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);

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

  // Enrichir les matchs : remplacer le nom de l'utilisateur courant par "Vous"
  const enrichedMatches = phaseMatches.map(match => ({
    ...match,
    players: match.players.map(p => ({
      ...p,
      name: p.id === null
        ? "BYE"
        : p.id === userId
          ? "Vous"
          : (p.name || `Joueur ${p.id.slice(-4)}`),
    })),
  }));

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
          {enrichedMatches.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Aucun match généré pour le bracket
            </p>
          ) : (
            <BracketView
              matches={enrichedMatches}
              readonly={true}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
