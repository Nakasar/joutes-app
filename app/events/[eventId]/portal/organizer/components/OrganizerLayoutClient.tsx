"use client";

import { useState, useEffect, useTransition, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult, Announcement } from "@/lib/schemas/event-portal.schema";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Users, Trophy, Megaphone, AlertCircle } from "lucide-react";
import { getMatchResults, getAnnouncements } from "../../actions";
import { getEventParticipants } from "../../participant-actions";
import { OrganizerContext } from "./OrganizerContext";

type OrganizerLayoutClientProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  children: ReactNode;
};

export default function OrganizerLayoutClient({ event, settings, userId, children }: OrganizerLayoutClientProps) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);

  const loadMatches = async () => {
    if (matchesLoaded) return;
    startTransition(async () => {
      const result = await getMatchResults(event.id);
      if (result.success && result.data) {
        setMatches(result.data as MatchResult[]);
        setMatchesLoaded(true);
      }
    });
  };

  const loadAnnouncements = async () => {
    if (announcementsLoaded) return;
    startTransition(async () => {
      const result = await getAnnouncements(event.id);
      if (result.success && result.data) {
        setAnnouncements(result.data as Announcement[]);
        setAnnouncementsLoaded(true);
      }
    });
  };

  const loadParticipants = async () => {
    if (participantsLoaded) return;
    startTransition(async () => {
      const result = await getEventParticipants(event.id);
      if (result.success && result.data) {
        setParticipants(result.data);
        setParticipantsLoaded(true);
      }
    });
  };

  useEffect(() => {
    loadMatches();
    loadAnnouncements();
    loadParticipants();
  }, []);

  const handleDataUpdate = () => {
    setMatchesLoaded(false);
    setAnnouncementsLoaded(false);
    setParticipantsLoaded(false);
    loadMatches();
    loadAnnouncements();
    loadParticipants();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{event.name} - Portail Organisateur</h1>
        <p className="text-muted-foreground">
          Gérez votre événement et suivez les résultats en temps réel
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <Link href={`/events/${event.id}/portal/organizer`}>
          <Button
            variant={pathname === `/events/${event.id}/portal/organizer` ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Settings className="h-4 w-4 mr-2" />
            Paramètres
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/organizer/participants`}>
          <Button
            variant={pathname?.includes("/participants") ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Users className="h-4 w-4 mr-2" />
            Participants
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/organizer/matches`}>
          <Button
            variant={pathname?.includes("/matches") ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Trophy className="h-4 w-4 mr-2" />
            Matchs
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/organizer/announcements`}>
          <Button
            variant={pathname?.includes("/announcements") ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Megaphone className="h-4 w-4 mr-2" />
            Annonces
          </Button>
        </Link>
      </div>

      {!settings && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le portail n&apos;a pas encore été configuré
          </AlertDescription>
        </Alert>
      )}

      <OrganizerContext.Provider value={{
        matches,
        announcements,
        participants,
        settings,
        onDataUpdate: handleDataUpdate,
      }}>
        {children}
      </OrganizerContext.Provider>
    </div>
  );
}
