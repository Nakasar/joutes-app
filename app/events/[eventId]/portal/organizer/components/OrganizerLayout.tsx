import { ReactNode } from "react";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings } from "@/lib/schemas/event-portal.schema";
import OrganizerLayoutClient from "./OrganizerLayoutClient";

type OrganizerLayoutProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  children: ReactNode;
};

export default function OrganizerLayout({ event, settings, userId, children }: OrganizerLayoutProps) {
  return (
    <OrganizerLayoutClient event={event} settings={settings} userId={userId}>
      {children}
    </OrganizerLayoutClient>
  );
}
