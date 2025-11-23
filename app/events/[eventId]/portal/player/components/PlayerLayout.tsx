"use client";

import { useState, useEffect, useTransition, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult, Announcement } from "@/lib/schemas/event-portal.schema";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trophy, Clock, History, Megaphone, AlertCircle } from "lucide-react";
import { getMatchResults, getAnnouncements, getPhaseStandings } from "../../actions";

type PlayerLayoutProps = {
  event: Event;
  settings: EventPortalSettings | null | undefined;
  userId: string;
  children: (props: {
    matches: MatchResult[];
    announcements: Announcement[];
    standings: any[];
    participants: any[];
    onMatchUpdate: () => void;
  }) => ReactNode;
};

export default function PlayerLayout({ event, settings, userId, children }: PlayerLayoutProps) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);
  const [standingsLoaded, setStandingsLoaded] = useState(false);

  const currentPhase = settings?.phases.find(p => p.id === settings?.currentPhaseId);

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

  const loadStandings = async () => {
    if (standingsLoaded || !settings?.currentPhaseId) return;
    startTransition(async () => {
      const phaseId = settings.currentPhaseId;
      if (!phaseId) return;
      
      const result = await getPhaseStandings(event.id, phaseId);
      if (result.success && result.data) {
        setStandings(result.data);
        setStandingsLoaded(true);
      }
    });
  };

  useEffect(() => {
    loadMatches();
    loadAnnouncements();
    if (pathname?.includes("/standings") || pathname?.includes("/bracket")) {
      loadStandings();
    }
  }, []);

  const handleMatchUpdate = () => {
    setMatchesLoaded(false);
    setStandingsLoaded(false);
    loadMatches();
    loadStandings();
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Portail Joueur</h1>
        <p className="text-muted-foreground">{event.name}</p>
        {currentPhase && (
          <p className="text-sm text-muted-foreground mt-1">
            Phase actuelle: {currentPhase.name} ({currentPhase.type === "swiss" ? "Rondes suisses" : "Élimination directe"})
          </p>
        )}
      </div>

      {!settings && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le portail n&apos;a pas encore été configuré par l&apos;organisateur
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <Link href={`/events/${event.id}/portal/player`}>
          <Button
            variant={pathname === `/events/${event.id}/portal/player` ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Clock className="h-4 w-4 mr-2" />
            Match actuel
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/player/history`}>
          <Button
            variant={pathname?.includes("/history") ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <History className="h-4 w-4 mr-2" />
            Historique
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/player/standings`}>
          <Button
            variant={pathname?.includes("/standings") ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Trophy className="h-4 w-4 mr-2" />
            Classement
          </Button>
        </Link>
        {currentPhase?.type === "bracket" && (
          <Link href={`/events/${event.id}/portal/player/bracket`}>
            <Button
              variant={pathname?.includes("/bracket") ? "default" : "ghost"}
              className="rounded-b-none"
            >
              <Trophy className="h-4 w-4 mr-2" />
              Bracket
            </Button>
          </Link>
        )}
        <Link href={`/events/${event.id}/portal/player/announcements`}>
          <Button
            variant={pathname?.includes("/announcements") ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Megaphone className="h-4 w-4 mr-2" />
            Annonces
          </Button>
        </Link>
      </div>

      {children({
        matches,
        announcements,
        standings,
        participants: [], // Plus utilisé, les noms sont maintenant dans les matchs
        onMatchUpdate: handleMatchUpdate,
      })}
    </div>
  );
}
