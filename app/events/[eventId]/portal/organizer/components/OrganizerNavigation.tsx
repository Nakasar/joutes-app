"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Settings, Users, Trophy, Megaphone, BarChart3 } from "lucide-react";

type OrganizerNavigationProps = {
  eventId: string;
};

export default function OrganizerNavigation({ eventId }: OrganizerNavigationProps) {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 mb-6 border-b">
      <Link href={`/events/${eventId}/portal/organizer`}>
        <Button
          variant={pathname === `/events/${eventId}/portal/organizer` ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Settings className="h-4 w-4 mr-2" />
          Paramètres
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/organizer/participants`}>
        <Button
          variant={pathname?.includes("/participants") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Users className="h-4 w-4 mr-2" />
          Participants
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/organizer/matches`}>
        <Button
          variant={pathname?.includes("/matches") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Trophy className="h-4 w-4 mr-2" />
          Matchs
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/organizer/standings`}>
        <Button
          variant={pathname?.includes("/standings") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Classement
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/organizer/announcements`}>
        <Button
          variant={pathname?.includes("/announcements") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Megaphone className="h-4 w-4 mr-2" />
          Annonces
        </Button>
      </Link>
    </div>
  );
}
