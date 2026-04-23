"use client";

import { createContext, useContext } from "react";
import { EventPortalSettings, MatchResult, Announcement } from "@/lib/schemas/event-portal.schema";

export type EventParticipant = {
  id: string;
  username?: string;
  discriminator?: string;
  email?: string;
  profileImage?: string;
  type: string;
  registrationStatus: string;
};

type OrganizerContextType = {
  matches: MatchResult[];
  announcements: Announcement[];
  participants: EventParticipant[];
  settings: EventPortalSettings | null | undefined;
  onDataUpdate: () => void;
};

export const OrganizerContext = createContext<OrganizerContextType | null>(null);

export function useOrganizerContext() {
  const context = useContext(OrganizerContext);
  if (!context) {
    throw new Error("useOrganizerContext must be used within OrganizerLayoutClient");
  }
  return context;
}
