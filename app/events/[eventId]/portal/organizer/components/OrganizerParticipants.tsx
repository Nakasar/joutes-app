"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AddParticipantForm from "../../../AddParticipantForm";
import { useOrganizerContext } from "./OrganizerContext";

type OrganizerParticipantsProps = {
  eventId: string;
};

export default function OrganizerParticipants({ eventId }: OrganizerParticipantsProps) {
  const { participants, onDataUpdate } = useOrganizerContext();

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
            onParticipantAdded={onDataUpdate}
            onParticipantRemoved={onDataUpdate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
