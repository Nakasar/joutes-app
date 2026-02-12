"use client";

import { useRouter } from "next/navigation";
import AddParticipantForm from "./AddParticipantForm";
import { RegistrationStatus } from "@/lib/types/Event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

type Participant = {
  id: string;
  username: string;
  discriminator?: string;
  email?: string;
  profileImage?: string;
  type: "user" | "email" | "guest";
  registrationStatus?: RegistrationStatus;
};

type ParticipantManagerWrapperProps = {
  eventId: string;
  participants: Participant[];
  runningState?: 'not-started' | 'ongoing' | 'completed';
  preRegistration?: boolean;
};

export default function ParticipantManagerWrapper({
  eventId,
  participants,
  runningState = 'not-started',
  preRegistration = false,
}: ParticipantManagerWrapperProps) {
  const router = useRouter();

  const handleParticipantChange = () => {
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <AddParticipantForm
        eventId={eventId}
        participants={participants}
        onParticipantAdded={handleParticipantChange}
        onParticipantRemoved={handleParticipantChange}
        runningState={runningState}
        preRegistration={preRegistration}
        readOnly
      />
    </div>
  );
}
