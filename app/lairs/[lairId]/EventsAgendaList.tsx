'use client';

import { Event } from '@/lib/types/Event';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, ExternalLink, Users, Star, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import EventDetailsModal from '@/app/events/EventDetailsModal';

interface EventsAgendaListProps {
  events: Event[];
}

export default function EventsAgendaList({ events }: EventsAgendaListProps) {
  const session = useSession();
  
  // État pour gérer les favoris localement (optimistic updates)
  const [localFavorites, setLocalFavorites] = useState<Record<string, boolean>>({});
  
  // État pour le modal de détails
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  
  // État pour le dialog d'erreur
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    type: "error" | "success";
    title: string;
    message: string;
  }>({ open: false, type: "error", title: "", message: "" });

  const handleToggleFavorite = async (eventId: string, currentlyFavorited: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!session.data?.user) {
      setDialogState({
        open: true,
        type: "error",
        title: "Authentification requise",
        message: "Vous devez être connecté pour mettre un événement en favori"
      });
      return;
    }

    // Optimistic update
    setLocalFavorites(prev => ({ ...prev, [eventId]: !currentlyFavorited }));

    try {
      const { toggleEventFavoriteAction } = await import("@/app/events/actions");
      const result = await toggleEventFavoriteAction(eventId);

      if (!result.success) {
        // Rollback on error
        setLocalFavorites(prev => ({ ...prev, [eventId]: currentlyFavorited }));
        setDialogState({
          open: true,
          type: "error",
          title: "Erreur",
          message: result.error || "Impossible de modifier les favoris"
        });
      }
    } catch (error) {
      // Rollback on error
      setLocalFavorites(prev => ({ ...prev, [eventId]: currentlyFavorited }));
      console.error("Erreur lors du toggle favori:", error);
      setDialogState({
        open: true,
        type: "error",
        title: "Erreur",
        message: "Une erreur est survenue"
      });
    }
  };

  const handleOpenEventDetails = (event: Event, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEvent(event);
    setIsDetailsModalOpen(true);
  };

  // Trier les événements par date de début
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
  });

  // Grouper les événements par mois
  const eventsByMonth = sortedEvents.reduce((acc, event) => {
    const date = new Date(event.startDateTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    
    if (!acc[monthKey]) {
      acc[monthKey] = {
        monthName,
        events: []
      };
    }
    acc[monthKey].events.push(event);
    return acc;
  }, {} as Record<string, { monthName: string; events: Event[] }>);

  if (sortedEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Aucun événement à venir</h3>
        <p className="text-muted-foreground">
          Il n&apos;y a pas d&apos;événements programmés pour le moment.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {Object.entries(eventsByMonth).map(([monthKey, { monthName, events }]) => (
          <div key={monthKey}>
            <h3 className="text-2xl font-bold mb-4 capitalize">{monthName}</h3>
            <div className="space-y-4">
              {events.map((event) => {
                const startDate = new Date(event.startDateTime);
                const endDate = new Date(event.endDateTime);
                const isSameDay = startDate.toDateString() === endDate.toDateString();
                
                // Vérifier si l'événement est en favori
                const isFavorited = localFavorites[event.id] !== undefined
                  ? localFavorites[event.id]
                  : event.favoritedBy?.includes(session.data?.user?.id || '') || false;

                return (
                  <Card key={event.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-start gap-6">
                        {/* Date box */}
                        <div className="flex-shrink-0">
                          <div className="bg-primary/10 rounded-lg p-4 text-center w-20">
                            <div className="text-3xl font-bold text-primary">
                              {startDate.getDate()}
                            </div>
                            <div className="text-sm text-muted-foreground uppercase">
                              {startDate.toLocaleDateString('fr-FR', { month: 'short' })}
                            </div>
                          </div>
                        </div>

                        {/* Event details */}
                        <div className="flex-1 space-y-3">
                          <div>
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <h4 className="text-xl font-semibold">{event.name}</h4>
                              <Badge
                                variant={
                                  event.status === 'available'
                                    ? 'default'
                                    : event.status === 'sold-out'
                                    ? 'secondary'
                                    : 'destructive'
                                }
                              >
                                {event.status === 'available'
                                  ? 'Disponible'
                                  : event.status === 'sold-out'
                                  ? 'Complet'
                                  : 'Annulé'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Gamepad2 className="h-4 w-4" />
                              <span className="text-sm font-medium">{event.gameName}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {startDate.toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {' - '}
                                {isSameDay
                                  ? endDate.toLocaleTimeString('fr-FR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : endDate.toLocaleDateString('fr-FR', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                              </span>
                            </div>

                            {event.lair?.address && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span>{event.lair.address}</span>
                              </div>
                            )}

                            {event.price !== undefined && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {event.price === 0 ? 'Gratuit' : `${event.price}€`}
                                </span>
                              </div>
                            )}

                            {event.maxParticipants && (
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  {event.participants?.length || 0} / {event.maxParticipants}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 pt-2">
                            {session.data?.user && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleToggleFavorite(event.id, isFavorited, e)}
                                className="gap-2"
                              >
                                <Star
                                  className={`h-4 w-4 ${
                                    isFavorited ? 'fill-yellow-400 text-yellow-400' : ''
                                  }`}
                                />
                                {isFavorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleOpenEventDetails(event, e)}
                              className="gap-2"
                            >
                              <Info className="h-4 w-4" />
                              Détails
                            </Button>
                            <Button asChild variant="outline" size="sm" className="gap-2">
                              <Link href={`/events/${event.id}`}>
                                <ExternalLink className="h-4 w-4" />
                                Voir la page
                              </Link>
                            </Button>
                            {event.url && (
                              <Button asChild variant="outline" size="sm">
                                <a
                                  href={event.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Site de l&apos;événement
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de détails de l'événement */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          open={isDetailsModalOpen}
          onOpenChange={(open) => {
            setIsDetailsModalOpen(open);
            if (!open) setSelectedEvent(null);
          }}
          userId={session.data?.user?.id}
        />
      )}

      {/* Dialog d'erreur/succès */}
      <Dialog open={dialogState.open} onOpenChange={(open) => setDialogState({ ...dialogState, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState.title}</DialogTitle>
            <DialogDescription>{dialogState.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogState({ ...dialogState, open: false })}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Gamepad2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="6" y1="11" x2="10" y2="11" />
      <line x1="8" y1="9" x2="8" y2="13" />
      <line x1="15" y1="12" x2="15.01" y2="12" />
      <line x1="18" y1="10" x2="18.01" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </svg>
  );
}
