import { ReactNode } from "react";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings } from "@/lib/schemas/event-portal.schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import OrganizerNavigation from "./OrganizerNavigation";
import RunningStateManager from "../../../RunningStateManager";

type OrganizerLayoutServerProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  children: ReactNode;
};

export default function OrganizerLayoutServer({ event, settings, children }: OrganizerLayoutServerProps) {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{event.name} - Portail Organisateur</h1>
        <p className="text-muted-foreground">
          Gérez votre événement et suivez les résultats en temps réel
        </p>
      </div>

      <div className="mb-4">
        <RunningStateManager
          eventId={event.id}
          runningState={event.runningState}
        />
      </div>

      <OrganizerNavigation eventId={event.id} />

      {!settings && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le portail n&apos;a pas encore été configuré
          </AlertDescription>
        </Alert>
      )}

      {children}
    </div>
  );
}
