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
};

export default function ParticipantManagerWrapper({
  eventId,
  participants,
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
    />
  );
}
