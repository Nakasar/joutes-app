'use client';

import { Event } from '@/lib/types/Event';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, Users, Star, Info, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState, useMemo } from 'react';
import { useSession } from '@/lib/auth-client';
import EventDetailsModal from '@/app/events/EventDetailsModal';

interface EventsConferenceViewProps {
  events: Event[];
}

export default function EventsConferenceView({ events }: EventsConferenceViewProps) {
  const session = useSession();
  
  // État pour gérer les favoris localement
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

  // Grouper les événements par jour
  const eventsByDay = useMemo(() => {
    const grouped: Record<string, Event[]> = {};
    
    events.forEach(event => {
      const date = new Date(event.startDateTime);
      const dayKey = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      if (!grouped[dayKey]) {
        grouped[dayKey] = [];
      }
      grouped[dayKey].push(event);
    });
    
    // Trier les événements de chaque jour par heure de début
    Object.keys(grouped).forEach(day => {
      grouped[day].sort((a, b) => 
        new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
      );
    });
    
    return grouped;
  }, [events]);

  // Liste des jours triés
  const sortedDays = useMemo(() => 
    Object.keys(eventsByDay).sort(), 
    [eventsByDay]
  );

  // Jour actuellement sélectionné
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const currentDay = sortedDays[currentDayIndex] || null;
  const currentDayEvents = currentDay ? eventsByDay[currentDay] : [];

  // Navigation entre les jours
  const goToPreviousDay = () => {
    setCurrentDayIndex(prev => Math.max(0, prev - 1));
  };

  const goToNextDay = () => {
    setCurrentDayIndex(prev => Math.min(sortedDays.length - 1, prev + 1));
  };

  // Grouper les événements par plage horaire pour affichage horizontal
  const timeSlots = useMemo(() => {
    if (!currentDayEvents.length) return [];

    const slots: Array<{ time: string; events: Event[] }> = [];
    const processedEvents = new Set<string>();

    currentDayEvents.forEach(event => {
      if (processedEvents.has(event.id)) return;

      const startTime = new Date(event.startDateTime);
      const timeKey = startTime.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      // Trouver tous les événements qui commencent à la même heure
      const concurrentEvents = currentDayEvents.filter(e => {
        const eStartTime = new Date(e.startDateTime);
        const eTimeKey = eStartTime.toLocaleTimeString('fr-FR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return eTimeKey === timeKey && !processedEvents.has(e.id);
      });

      concurrentEvents.forEach(e => processedEvents.add(e.id));

      slots.push({
        time: timeKey,
        events: concurrentEvents
      });
    });

    return slots;
  }, [currentDayEvents]);

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

    setLocalFavorites(prev => ({ ...prev, [eventId]: !currentlyFavorited }));

    try {
      const { toggleEventFavoriteAction } = await import("@/app/events/actions");
      const result = await toggleEventFavoriteAction(eventId);

      if (!result.success) {
        setLocalFavorites(prev => ({ ...prev, [eventId]: currentlyFavorited }));
        setDialogState({
          open: true,
          type: "error",
          title: "Erreur",
          message: result.error || "Impossible de modifier les favoris"
        });
      }
    } catch (error) {
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

  if (sortedDays.length === 0) {
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

  const formatDayHeader = (dayKey: string) => {
    const date = new Date(dayKey);
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Navigation des jours */}
        <div className="flex items-center justify-between bg-card rounded-lg p-4 border">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousDay}
            disabled={currentDayIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Jour précédent
          </Button>
          
          <div className="text-center">
            <h3 className="text-lg font-semibold capitalize">
              {currentDay && formatDayHeader(currentDay)}
            </h3>
            <p className="text-sm text-muted-foreground">
              Jour {currentDayIndex + 1} sur {sortedDays.length}
            </p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextDay}
            disabled={currentDayIndex === sortedDays.length - 1}
          >
            Jour suivant
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* Vue en grille de conférence */}
        <div className="space-y-6">
          {timeSlots.map((slot, slotIndex) => (
            <div key={slotIndex} className="space-y-3">
              {/* Heure du créneau */}
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Clock className="h-4 w-4" />
                {slot.time}
              </div>
              
              {/* Événements simultanés en grille horizontale */}
              <div className={`grid gap-4 ${
                slot.events.length === 1 ? 'grid-cols-1' :
                slot.events.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
                'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              }`}>
                {slot.events.map(event => {
                  const startDate = new Date(event.startDateTime);
                  const endDate = new Date(event.endDateTime);
                  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
                  
                  const isFavorited = localFavorites[event.id] !== undefined
                    ? localFavorites[event.id]
                    : event.favoritedBy?.includes(session.data?.user?.id || '') || false;

                  return (
                    <Card 
                      key={event.id} 
                      className="hover:shadow-lg transition-shadow relative overflow-hidden"
                    >
                      {/* Barre de couleur latérale selon le statut */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        event.status === 'available' ? 'bg-green-500' :
                        event.status === 'sold-out' ? 'bg-orange-500' :
                        'bg-red-500'
                      }`} />
                      
                      <CardContent className="p-4 pl-5">
                        <div className="space-y-3">
                          {/* En-tête */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-base line-clamp-2 mb-1">
                                {event.name}
                              </h4>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Gamepad2 className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{event.gameName}</span>
                              </div>
                            </div>
                            <Badge
                              variant={
                                event.status === 'available'
                                  ? 'default'
                                  : event.status === 'sold-out'
                                  ? 'secondary'
                                  : 'destructive'
                              }
                              className="flex-shrink-0"
                            >
                              {event.status === 'available'
                                ? 'Dispo'
                                : event.status === 'sold-out'
                                ? 'Complet'
                                : 'Annulé'}
                            </Badge>
                          </div>

                          {/* Informations */}
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              <span>
                                {startDate.toLocaleTimeString('fr-FR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                                {' - '}
                                {endDate.toLocaleTimeString('fr-FR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                                <span className="ml-1">({duration} min)</span>
                              </span>
                            </div>

                            {event.lair?.address && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{event.lair.address}</span>
                              </div>
                            )}

                            {event.maxParticipants && (
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                <span>
                                  {event.participants?.length || 0} / {event.maxParticipants}
                                </span>
                              </div>
                            )}

                            {event.price !== undefined && (
                              <div className="font-semibold text-foreground">
                                {event.price === 0 ? 'Gratuit' : `${event.price}€`}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 pt-2">
                            {session.data?.user && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleToggleFavorite(event.id, isFavorited, e)}
                                className="h-8 px-2"
                                title={isFavorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                              >
                                <Star
                                  className={`h-4 w-4 ${
                                    isFavorited ? 'fill-yellow-400 text-yellow-400' : ''
                                  }`}
                                />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleOpenEventDetails(event, e)}
                              className="h-8 px-2"
                              title="Voir les détails"
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            {event.url && (
                              <Button 
                                asChild 
                                variant="ghost" 
                                size="sm"
                                className="h-8 px-2"
                                title="Site de l'événement"
                              >
                                <a
                                  href={event.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
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
