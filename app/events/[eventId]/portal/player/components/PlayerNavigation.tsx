"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trophy, Clock, History, Megaphone } from "lucide-react";

type PlayerNavigationProps = {
  eventId: string;
};

export default function PlayerNavigation({ eventId }: PlayerNavigationProps) {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 mb-6 border-b">
      <Link href={`/events/${eventId}/portal/player`}>
        <Button
          variant={pathname === `/events/${eventId}/portal/player` ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Clock className="h-4 w-4 mr-2" />
          Match actuel
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/player/standings`}>
        <Button
          variant={pathname?.includes("/standings") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Trophy className="h-4 w-4 mr-2" />
          Classement
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/player/bracket`}>
        <Button
          variant={pathname?.includes("/bracket") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <Trophy className="h-4 w-4 mr-2" />
          Bracket
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/player/history`}>
        <Button
          variant={pathname?.includes("/history") ? "default" : "ghost"}
          className="rounded-b-none"
        >
          <History className="h-4 w-4 mr-2" />
          Historique
        </Button>
      </Link>
      <Link href={`/events/${eventId}/portal/player/announcements`}>
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
