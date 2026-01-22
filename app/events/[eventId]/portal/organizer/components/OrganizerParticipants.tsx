import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AddParticipantForm from "../../../AddParticipantForm";

type OrganizerParticipantsProps = {
  eventId: string;
  participants: any[];
  runningState?: 'not-started' | 'ongoing' | 'completed';
};

export default function OrganizerParticipants({ eventId, participants, runningState }: OrganizerParticipantsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestion des participants</CardTitle>
          <CardDescription>
            Ajoutez des participants par user tag, email ou comme invités
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddParticipantForm
            eventId={eventId}
            participants={participants}
            runningState={runningState}
          />
        </CardContent>
      </Card>
    </div>
  );
}
