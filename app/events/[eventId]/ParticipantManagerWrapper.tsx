"use client";

import { useRouter } from "next/navigation";
import AddParticipantForm from "./AddParticipantForm";

type Participant = {
  id: string;
  username: string;
  discriminator?: string;
  email?: string;
  profileImage?: string;
  type: "user" | "email" | "guest";
};

type ParticipantManagerWrapperProps = {
  eventId: string;
  participants: Participant[];
  runningState?: 'not-started' | 'ongoing' | 'completed';
};

export default function ParticipantManagerWrapper({
  eventId,
  participants,
  runningState = 'not-started',
}: ParticipantManagerWrapperProps) {
  const router = useRouter();

  const handleParticipantChange = () => {
    router.refresh();
  };

  return (
    <AddParticipantForm
      eventId={eventId}
      participants={participants}
      onParticipantAdded={handleParticipantChange}
      onParticipantRemoved={handleParticipantChange}
      runningState={runningState}
    />
  );
}
