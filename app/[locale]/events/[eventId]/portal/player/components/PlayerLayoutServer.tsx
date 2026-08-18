import { ReactNode } from "react";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings } from "@/lib/schemas/event-portal.schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import PlayerNavigation from "./PlayerNavigation";

type PlayerLayoutServerProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  children: ReactNode;
};

export default function PlayerLayoutServer({ event, settings, children }: PlayerLayoutServerProps) {
  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Portail Joueur</h1>
        <p className="text-muted-foreground">{event.name}</p>
        {currentPhase && (
          <p className="text-sm text-muted-foreground mt-1">
            Phase actuelle: {currentPhase.name} ({currentPhase.type === "swiss" ? "Rondes suisses" : "Élimination directe"})
          </p>
        )}
      </div>

      <PlayerNavigation eventId={event.id} />

      {!settings && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le portail n&apos;est pas encore configuré
          </AlertDescription>
        </Alert>
      )}

      {children}
    </div>
  );
}
