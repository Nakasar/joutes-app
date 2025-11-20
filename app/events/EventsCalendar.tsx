"use client";

import { Event } from "@/lib/types/Event";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Gamepad2, Euro, Filter, List, CalendarDays, Clock, Navigation, X, User2Icon, AlertCircle, CheckCircle, Star, HelpCircle } from "lucide-react";
import Link from "next/link";
import { DateTime } from "luxon";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import EventDetailsModal from "./EventDetailsModal";

type EventsCalendarProps = {
  events: Event[];
  showViewToggle?: boolean;
  currentMonth?: number;
  currentYear?: number;
  showAllGames?: boolean;
  onMonthChange?: (month: number, year: number) => void;
  onToggleAllGames?: () => void;
  onLocationSearch?: (latitude: number, longitude: number, distance: number) => void;
  onResetLocation?: () => void;
  isLocationMode?: boolean;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
};

export default function EventsCalendar({
  events,
  showViewToggle = true,
  currentMonth: controlledMonth,
  currentYear: controlledYear,
  showAllGames: controlledShowAllGames,
  onMonthChange,
  onToggleAllGames,
  onLocationSearch,
  onResetLocation,
  isLocationMode = false,
  userLocation,
}: EventsCalendarProps) {
  const today = DateTime.now();
  const [internalMonth, setInternalMonth] = useState<number>(today.month);
  const [internalYear, setInternalYear] = useState<number>(today.year);
  const [internalShowAllGames, setInternalShowAllGames] = useState(true);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [coordinates, setCoordinates] = useState("");
  const [distance, setDistance] = useState("15");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    type: "error" | "success";
    title: string;
    message: string;
  }>({ open: false, type: "error", title: "", message: "" });
  const session = useSession();
  
  // État pour gérer les favoris localement (optimistic updates)
  const [localFavorites, setLocalFavorites] = useState<Record<string, boolean>>({});
  
  // État pour le modal de détails
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Détecter la taille de l'écran et initialiser la vue en conséquence
  useEffect(() => {
    const checkScreenSize = () => {
      // Sur les petits écrans (< 768px, équivalent à sm breakpoint de Tailwind), utiliser la vue liste
      if (window.innerWidth < 768) {
        setViewMode("list");
      }
    };

    // Vérifier au montage du composant
    checkScreenSize();

    // Écouter les changements de taille d'écran
    window.addEventListener("resize", checkScreenSize);

    // Nettoyer l'écouteur
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Use controlled values if provided, otherwise use internal state
  const currentMonth = controlledMonth !== undefined ? controlledMonth : internalMonth;
  const currentYear = controlledYear !== undefined ? controlledYear : internalYear;
  const showAllGames = controlledShowAllGames !== undefined ? controlledShowAllGames : internalShowAllGames;

  // Navigation entre les mois
  const goToPreviousMonth = () => {
    let newMonth = currentMonth;
    let newYear = currentYear;

    if (currentMonth === 1) {
      newMonth = 12;
      newYear = currentYear - 1;
    } else {
      newMonth = currentMonth - 1;
    }

    if (onMonthChange) {
      onMonthChange(newMonth, newYear);
    } else {
      setInternalMonth(newMonth);
      setInternalYear(newYear);
    }
  };

  const goToNextMonth = () => {
    let newMonth = currentMonth;
    let newYear = currentYear;

    if (currentMonth === 12) {
      newMonth = 1;
      newYear = currentYear + 1;
    } else {
      newMonth = currentMonth + 1;
    }

    if (onMonthChange) {
      onMonthChange(newMonth, newYear);
    } else {
      setInternalMonth(newMonth);
      setInternalYear(newYear);
    }
  };

  const goToCurrentMonth = () => {
    if (onMonthChange) {
      onMonthChange(today.month, today.year);
    } else {
      setInternalMonth(today.month);
      setInternalYear(today.year);
    }
  };

  const handleToggleAllGames = () => {
    if (onToggleAllGames) {
      onToggleAllGames();
    } else {
      setInternalShowAllGames(!showAllGames);
    }
  };

  const handleGetCurrentLocation = () => {
    // Si l'utilisateur a une localisation sauvegardée, l'utiliser en priorité
    if (userLocation?.latitude && userLocation?.longitude) {
      setCoordinates(`${userLocation.latitude}, ${userLocation.longitude}`);
      setIsGettingLocation(false);
      return;
    }

    // Sinon, utiliser la géolocalisation du navigateur
    if (!navigator.geolocation) {
      setDialogState({
        open: true,
        type: "error",
        title: "Géolocalisation non supportée",
        message: "La géolocalisation n'est pas supportée par votre navigateur"
      });
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCoordinates(`${lat}, ${lon}`);
        setIsGettingLocation(false);
      },
      (error) => {
        console.error("Erreur de géolocalisation:", error);
        setDialogState({
          open: true,
          type: "error",
          title: "Erreur de géolocalisation",
          message: "Impossible d'obtenir votre position. Veuillez entrer vos coordonnées manuellement."
        });
        setIsGettingLocation(false);
      }
    );
  };

  const handleLocationSearch = () => {
    if (!coordinates.trim()) {
      setDialogState({
        open: true,
        type: "error",
        title: "Coordonnées manquantes",
        message: "Veuillez entrer des coordonnées GPS ou utiliser la localisation automatique"
      });
      return;
    }

    const parts = coordinates.split(',').map(s => s.trim());
    if (parts.length !== 2) {
      setDialogState({
        open: true,
        type: "error",
        title: "Format invalide",
        message: "Utilisez le format: latitude, longitude (ex: 48.8566, 2.3522)"
      });
      return;
    }

    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lon)) {
      setDialogState({
        open: true,
        type: "error",
        title: "Coordonnées invalides",
        message: "Veuillez entrer des nombres valides."
      });
      return;
    }

    if (onLocationSearch) {
      onLocationSearch(lat, lon, parseInt(distance));
      setShowLocationForm(false);
    }
  };

  const handleResetLocation = () => {
    setCoordinates("");
    setDistance("15");
    setShowLocationForm(false);
    if (onResetLocation) {
      onResetLocation();
    }
  };

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

  const isCreatorOrOwner = (event: Event) => {
    if (!session.data?.user) return false;
    // Vérifier si l'utilisateur est le créateur
    if (event.creatorId === session.data.user.id) return true;
    // Vérifier si l'utilisateur est propriétaire du lair (si lair existe)
    if (event.lair && 'owners' in event.lair) {
      const lair = event.lair as any;
      if (lair.owners && Array.isArray(lair.owners) && lair.owners.includes(session.data.user.id)) {
        return true;
      }
    }
    return false;
  };

  const handleNearMeClick = () => {
    // Si l'utilisateur a une localisation enregistrée, l'appliquer directement
    if (userLocation?.latitude && userLocation?.longitude) {
      if (onLocationSearch) {
        onLocationSearch(userLocation.latitude, userLocation.longitude, parseInt(distance));
      }
    } else {
      // Sinon, afficher le formulaire
      setShowLocationForm(true);
    }
  };

  const handleSaveLocation = async () => {
    if (!session.data?.user) {
      setDialogState({
        open: true,
        type: "error",
        title: "Authentification requise",
        message: "Vous devez être connecté pour sauvegarder votre localisation"
      });
      return;
    }

    if (!coordinates.trim()) {
      setDialogState({
        open: true,
        type: "error",
        title: "Coordonnées manquantes",
        message: "Veuillez entrer des coordonnées GPS ou utiliser la localisation automatique"
      });
      return;
    }

    const parts = coordinates.split(',').map(s => s.trim());
    if (parts.length !== 2) {
      setDialogState({
        open: true,
        type: "error",
        title: "Format invalide",
        message: "Utilisez le format: latitude, longitude (ex: 48.8566, 2.3522)"
      });
      return;
    }

    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lon)) {
      setDialogState({
        open: true,
        type: "error",
        title: "Coordonnées invalides",
        message: "Veuillez entrer des nombres valides."
      });
      return;
    }

    if (lat < -90 || lat > 90) {
      setDialogState({
        open: true,
        type: "error",
        title: "Latitude invalide",
        message: "La latitude doit être comprise entre -90 et 90."
      });
      return;
    }

    if (lon < -180 || lon > 180) {
      setDialogState({
        open: true,
        type: "error",
        title: "Longitude invalide",
        message: "La longitude doit être comprise entre -180 et 180."
      });
      return;
    }

    setIsSavingLocation(true);

    try {
      const { updateUserLocation } = await import("@/app/account/actions");
      const result = await updateUserLocation(lat, lon);

      if (result.success) {
        setDialogState({
          open: true,
          type: "success",
          title: "Localisation sauvegardée",
          message: "Localisation sauvegardée avec succès sur votre compte !"
        });
        // Recharger la page après 2 secondes pour mettre à jour les données utilisateur
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setDialogState({
          open: true,
          type: "error",
          title: "Erreur de sauvegarde",
          message: result.error || "Erreur lors de la sauvegarde de la localisation"
        });
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      setDialogState({
        open: true,
        type: "error",
        title: "Erreur de sauvegarde",
        message: "Erreur lors de la sauvegarde de la localisation"
      });
    } finally {
      setIsSavingLocation(false);
    }
  };

  // Obtenir le nombre de jours dans le mois
  const getDaysInMonth = (month: number, year: number) => {
    return DateTime.local(year, month, 1).daysInMonth || 31;
  };

  // Obtenir le premier jour de la semaine du mois (0 = lundi, 6 = dimanche)
  const getFirstDayOfMonth = (month: number, year: number) => {
    const firstDay = DateTime.local(year, month, 1).weekday;
    // weekday dans Luxon: 1 = lundi, 7 = dimanche
    // Convertir pour que lundi soit 0 et dimanche soit 6
    return firstDay - 1;
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOfWeek = getFirstDayOfMonth(currentMonth, currentYear);

  // Les événements sont déjà filtrés par mois et par jeux côté serveur
  // On les trie simplement par date
  const eventsInMonth = useMemo(() => {
    return events.sort((a, b) => {
      const dateA = DateTime.fromISO(a.startDateTime);
      const dateB = DateTime.fromISO(b.startDateTime);
      return dateA.toMillis() - dateB.toMillis();
    });
  }, [events]);

  // Organiser les événements par jour
  const eventsByDay = new Map<number, Event[]>();
  eventsInMonth.forEach((event) => {
    const day = DateTime.fromISO(event.startDateTime).day;
    if (!eventsByDay.has(day)) {
      eventsByDay.set(day, []);
    }
    eventsByDay.get(day)?.push(event);
  });

  // Grouper les événements par jour pour la vue liste (mobile)
  // Ne montrer que les événements à partir du jour actuel
  const eventsByDayForList = useMemo(() => {
    const grouped = new Map<string, Event[]>();
    const todayStart = today.startOf('day');

    eventsInMonth.forEach((event) => {
      const eventDate = DateTime.fromISO(event.startDateTime);

      // Ne garder que les événements à partir d'aujourd'hui
      if (eventDate >= todayStart) {
        const dayKey = eventDate.setLocale('fr').toLocaleString({
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        if (!grouped.has(dayKey)) {
          grouped.set(dayKey, []);
        }
        grouped.get(dayKey)?.push(event);
      }
    });
    return grouped;
  }, [eventsInMonth, today]);

  // Noms des mois en français
  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  // Noms des jours de la semaine
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  // Générer les jours du calendrier (avec les cases vides au début)
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const isToday = (day: number | null) => {
    if (day === null) return false;
    return (
      day === today.day &&
      currentMonth === today.month &&
      currentYear === today.year
    );
  };

  const getStatusVariant = (status: Event["status"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "available":
        return "default";
      case "sold-out":
        return "destructive";
      case "cancelled":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: Event["status"]) => {
    switch (status) {
      case "available":
        return "Disponible";
      case "sold-out":
        return "Complet";
      case "cancelled":
        return "Annulé";
      default:
        return status;
    }
  };

  return (
    <>
    <div className="space-y-6">
      {/* En-tête avec navigation */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            {/* Navigation mois */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <Button
                onClick={goToPreviousMonth}
                className="w-full sm:w-auto"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Mois précédent
              </Button>

              <div className="text-center">
                <CardTitle className="text-2xl">
                  {monthNames[currentMonth - 1]} {currentYear}
                </CardTitle>
                {(currentMonth !== today.month ||
                  currentYear !== today.year) && (
                    <Button
                      onClick={goToCurrentMonth}
                      className="mt-2 text-sm"
                      variant="ghost"
                    >
                      Revenir au mois actuel
                    </Button>
                  )}
              </div>

              <Button
                onClick={goToNextMonth}
                className="w-full sm:w-auto"
              >
                Mois suivant
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Boutons de contrôle */}
            {showViewToggle && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 justify-center">
                  {/* Bouton de toggle vue calendrier/liste */}
                  <Button
                    variant="outline"
                    onClick={() => setViewMode(viewMode === "calendar" ? "list" : "calendar")}
                    className="w-full sm:w-auto"
                  >
                    {viewMode === "calendar" ? (
                      <>
                        <List className="mr-2 h-4 w-4" />
                        Vue liste
                      </>
                    ) : (
                      <>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Vue calendrier
                      </>
                    )}
                  </Button>

                  {/* Boutons spécifiques aux utilisateurs connectés */}
                  {!session.isPending && session.data?.user && (
                    <>
                      {/* Bouton de filtre par jeux */}
                      <Button
                        variant={showAllGames ? "outline" : "default"}
                        onClick={handleToggleAllGames}
                        className="w-full sm:w-auto"
                      >
                        <Filter className="mr-2 h-4 w-4" />
                        {showAllGames ? "Afficher mes jeux uniquement" : "Afficher tous les jeux"}
                      </Button>

                      {/* Bouton Mes lieux (mode normal) */}
                      {isLocationMode && (
                        <Button
                          variant="default"
                          onClick={handleResetLocation}
                          className="w-full sm:w-auto"
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          Mes lieux
                        </Button>
                      )}
                    </>
                  )}

                  {/* Bouton Proches de moi - disponible pour tous */}
                  {!isLocationMode && (
                    <Button
                      variant="outline"
                      onClick={handleNearMeClick}
                      className="w-full sm:w-auto"
                    >
                      <Navigation className="mr-2 h-4 w-4" />
                      Proches de moi
                    </Button>
                  )}

                  {/* Bouton Modifier la localisation - en mode localisation avec userLocation */}
                  {isLocationMode && userLocation && (
                    <Button
                      variant="outline"
                      onClick={() => setShowLocationForm(!showLocationForm)}
                      className="w-full sm:w-auto"
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      Modifier la localisation
                    </Button>
                  )}

                  {/* Bouton Se connecter pour personnaliser - uniquement pour non connectés */}
                  {!session.isPending && !session.data?.user && (
                    <Button
                      variant="default"
                      className="w-full sm:w-auto"
                      asChild
                    >
                      <Link href="/login">
                        <Filter className="mr-2 h-4 w-4" />
                        Se connecter pour personnaliser
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Formulaire de recherche par localisation */}
                {showLocationForm && (
                  <Card className="border-2 border-primary">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        {userLocation && (
                          <div className="p-3 bg-muted/50 rounded-lg text-sm">
                            <p className="font-medium mb-1">Localisation enregistrée</p>
                            <p className="text-muted-foreground">
                              Votre localisation par défaut sera utilisée : {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                            </p>
                          </div>
                        )}
                        
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Coordonnées GPS
                          </label>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              value={coordinates}
                              onChange={(e) => setCoordinates(e.target.value)}
                              placeholder="48.8566, 2.3522"
                              className="flex-1"
                            />
                            <Button
                              variant="outline"
                              onClick={handleGetCurrentLocation}
                              disabled={isGettingLocation}
                              className="flex-shrink-0"
                            >
                              {isGettingLocation ? (
                                <>Localisation...</>
                              ) : (
                                <>
                                  <Navigation className="h-4 w-4" />
                                </>
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {userLocation 
                              ? "Cliquez sur le bouton pour utiliser votre localisation enregistrée ou entrez d&apos;autres coordonnées"
                              : "Format : latitude, longitude ou cliquez sur le bouton pour obtenir votre position"
                            }
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Distance maximale
                          </label>
                          <Select value={distance} onValueChange={setDistance}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 km</SelectItem>
                              <SelectItem value="5">5 km</SelectItem>
                              <SelectItem value="15">15 km</SelectItem>
                              <SelectItem value="50">50 km</SelectItem>
                              <SelectItem value="150">150 km</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button
                            onClick={handleLocationSearch}
                            className="flex-1"
                          >
                            <Navigation className="mr-2 h-4 w-4" />
                            Rechercher
                          </Button>
                          
                          {session.data?.user && (
                            <Button
                              variant="secondary"
                              onClick={handleSaveLocation}
                              disabled={isSavingLocation || !coordinates.trim()}
                              className="flex-1"
                            >
                              <MapPin className="mr-2 h-4 w-4" />
                              {isSavingLocation ? "Sauvegarde..." : "Sauvegarder sur mon compte"}
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            onClick={() => setShowLocationForm(false)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Vue calendrier */}
      {viewMode === "calendar" && (
        <div>
          <Card>
            <CardContent className="p-4">
              {/* En-têtes des jours de la semaine */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {dayNames.map((dayName) => (
                  <div
                    key={dayName}
                    className="text-center font-semibold text-muted-foreground py-2"
                  >
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Jours du calendrier */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, index) => (
                  <div
                    key={index}
                    className={`min-h-[120px] border rounded-lg p-2 ${day === null
                      ? "bg-muted/30"
                      : isToday(day)
                        ? "bg-primary/10 border-primary"
                        : "bg-card"
                      }`}
                  >
                    {day !== null && (
                      <>
                        <div
                          className={`text-sm font-semibold mb-1 ${isToday(day)
                            ? "text-primary"
                            : "text-foreground"
                            }`}
                        >
                          {day}
                        </div>
                        <div className="flex gap-1 flex-col">
                          {eventsByDay.get(day)?.map((event) => {
                            const startTime = DateTime.fromISO(
                              event.startDateTime
                            ).setZone('Europe/Paris').toLocaleString(DateTime.TIME_24_SIMPLE);
                            const isFavorited = localFavorites[event.id] !== undefined 
                              ? localFavorites[event.id] 
                              : event.favoritedBy?.includes(session.data?.user?.id || "");
                            const isUserEvent = session.data?.user?.id && (
                              event.creatorId === session.data?.user?.id || 
                              event.participants?.includes(session.data?.user?.id || "") ||
                              isFavorited
                            );

                            const eventContent = (
                              <div className={cn("text-xs p-2 rounded-md bg-background border hover:bg-accent hover:border-accent-foreground transition-colors cursor-pointer", isUserEvent && "border-yellow-500")}>
                                <div className="font-semibold truncate mb-1" title={event.name}>
                                  {event.name}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1" suppressHydrationWarning>
                                  <CalendarIcon className="h-3 w-3" />
                                  {startTime}
                                </div>
                                {event.creator ? (
                                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1" title={event.lair?.name}>
                                    <User2Icon className="h-3 w-3" />
                                    {event.creator.displayName ? `${event.creator.displayName}#${event.creator.discriminator}` : "Utilisateur inconnu"}
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1" title={event.lair?.name}>
                                    <MapPin className="h-3 w-3" />
                                    {event.lair?.name || "Lieu inconnu"}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                  <Gamepad2 className="h-3 w-3" />
                                  {event.gameName}
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <Badge variant={getStatusVariant(event.status)} className="text-xs">
                                    {getStatusLabel(event.status)}
                                  </Badge>
                                  {event.price && (
                                    <span className="text-xs font-semibold flex items-center">
                                      <Euro className="h-3 w-3" />
                                      {event.price}
                                    </span>
                                  )}
                                </div>
                                {event.creatorId === session.data?.user?.id && (
                                  <Badge variant="default" className="text-xs bg-blue-500 text-white mt-1">
                                    Créateur
                                  </Badge>
                                )}
                                {event.participants?.includes(session.data?.user?.id || "") && (
                                  <Badge variant="default" className="text-xs bg-green-500 text-white mt-1">
                                    Inscrit
                                  </Badge>
                                )}
                                {/* Boutons d'action en bas */}
                                <div className="flex gap-1 mt-2 pt-2 border-t">
                                  {/* Bouton info */}
                                  <button
                                    onClick={(e) => handleOpenEventDetails(event, e)}
                                    className="flex-1 p-1 hover:bg-accent rounded-sm transition-colors flex items-center justify-center"
                                    title="Voir les détails"
                                  >
                                    <HelpCircle className="h-3 w-3" />
                                  </button>
                                  {/* Bouton favori */}
                                  {session.data?.user && (
                                    <button
                                      onClick={(e) => handleToggleFavorite(event.id, !!isFavorited, e)}
                                      className="flex-1 p-1 hover:bg-accent rounded-sm transition-colors flex items-center justify-center gap-1"
                                      title={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
                                    >
                                      <Star 
                                        className={cn("h-3 w-3", isFavorited && "fill-yellow-500 text-yellow-500")} 
                                      />
                                      {event.favoritedBy && event.favoritedBy.length > 0 && (
                                        <span className="text-[10px] font-medium">{event.favoritedBy.length}</span>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );

                            return event.url ? (
                              <Link
                                key={event.id}
                                href={event.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {eventContent}
                              </Link>
                            ) : (
                              <Link
                                key={event.id}
                                href={`/events/${event.id}`}
                              >
                                {eventContent}
                              </Link>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Légende */}
          <div className="flex flex-wrap gap-4 justify-center mt-4">
            <div className="flex items-center gap-2">
              <Badge variant="default">Disponible</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">Complet</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Annulé</Badge>
            </div>
          </div>
        </div>
      )}

      {/* Vue liste */}
      {viewMode === "list" && (
        <ListView
          eventsInMonth={eventsInMonth}
          eventsByDayForList={eventsByDayForList}
          today={today}
          userId={session.data?.user?.id}
          getStatusVariant={getStatusVariant}
          getStatusLabel={getStatusLabel}
          localFavorites={localFavorites}
          onToggleFavorite={handleToggleFavorite}
          onOpenEventDetails={handleOpenEventDetails}
        />
      )}
    </div>

    {/* Modal de détails de l'événement */}
    {selectedEvent && (
      <EventDetailsModal
        event={selectedEvent}
        open={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        isCreatorOrOwner={isCreatorOrOwner(selectedEvent)}
        userId={session.data?.user?.id}
      />
    )}

    {/* Dialog pour les messages d'erreur et de succès */}
    <Dialog open={dialogState.open} onOpenChange={(open) => setDialogState({ ...dialogState, open })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dialogState.type === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            {dialogState.title}
          </DialogTitle>
          <DialogDescription>
            {dialogState.message}
          </DialogDescription>
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

// Composant pour la vue liste
type ListViewProps = {
  eventsInMonth: Event[];
  eventsByDayForList: Map<string, Event[]>;
  today: DateTime;
  userId?: string;
  getStatusVariant: (status: Event["status"]) => "default" | "secondary" | "destructive" | "outline";
  getStatusLabel: (status: Event["status"]) => string;
  localFavorites: Record<string, boolean>;
  onToggleFavorite: (eventId: string, currentlyFavorited: boolean, e: React.MouseEvent) => void;
  onOpenEventDetails: (event: Event, e: React.MouseEvent) => void;
};

function ListView({
  eventsInMonth,
  eventsByDayForList,
  today,
  userId,
  getStatusVariant,
  getStatusLabel,
  localFavorites,
  onToggleFavorite,
  onOpenEventDetails
}: ListViewProps) {
  if (eventsInMonth.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Aucun événement ce mois-ci
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(eventsByDayForList.entries()).map(([dayKey, dayEvents]) => {
        const firstEventDate = DateTime.fromISO(dayEvents[0].startDateTime);
        const isEventToday =
          firstEventDate.day === today.day &&
          firstEventDate.month === today.month &&
          firstEventDate.year === today.year;

        return (
          <div key={dayKey} className="space-y-3">
            {/* En-tête du jour */}
            <div
              className={`sticky top-16 z-10 py-3 px-4 rounded-lg font-bold text-lg capitalize ${isEventToday
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
                }`}
            >
              {dayKey}
              {isEventToday && " - Aujourd'hui"}
            </div>

            {/* Événements du jour */}
            <div className="space-y-2">
              {dayEvents.map((event) => {
                const eventDate = DateTime.fromISO(event.startDateTime);
                const endDate = DateTime.fromISO(event.endDateTime);
                const timeStr = eventDate.setZone('Europe/Paris').toLocaleString(DateTime.TIME_24_SIMPLE);
                const endTimeStr = endDate.setZone('Europe/Paris').toLocaleString(DateTime.TIME_24_SIMPLE);
                const isFavorited = localFavorites[event.id] !== undefined 
                  ? localFavorites[event.id] 
                  : event.favoritedBy?.includes(userId || "");
                const isUserEvent = userId && (
                  event.creatorId === userId || 
                  event.participants?.includes(userId || "") ||
                  isFavorited
                );

                const cardContent = (
                  <Card
                    className={cn(`my-2 hover:shadow-lg transition-shadow ${event.url ? "cursor-pointer hover:bg-accent" : ""}`, event.status === "available"
                      ? "border-l-4 border-l-green-500"
                      : event.status === "sold-out"
                        ? "border-l-4 border-l-red-500"
                        : "border-l-4 border-l-gray-400"
                    , isUserEvent && "border-yellow-500")}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-xl">
                          {event.name}
                        </CardTitle>
                        <Badge variant={getStatusVariant(event.status)}>
                          {getStatusLabel(event.status)}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground" suppressHydrationWarning>
                        <CalendarIcon className="h-4 w-4" />
                        {timeStr} - {endTimeStr}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>
                          Durée : {endDate.diff(eventDate, 'hours').hours.toFixed(1)}h
                        </span>
                      </div>
                      {event.creator ? (
                        <div className="flex items-center gap-2 text-sm">
                          <User2Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {event.creator.displayName ? `${event.creator.displayName}#${event.creator.discriminator}` : "Utilisateur inconnu"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {event.lair?.name || "Lieu inconnu"}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                        <span>{event.gameName}</span>
                      </div>
                      {event.price && (
                        <div className="flex items-center gap-2 text-sm">
                          <Euro className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">
                            {event.price === 0 ? "Gratuit" : `${event.price}€`}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {event.creatorId === userId && (
                          <Badge variant="default" className="text-xs bg-blue-500 text-white">
                            Créateur
                          </Badge>
                        )}
                        {event.participants?.includes(userId || "") && (
                          <Badge variant="default" className="text-xs bg-green-500 text-white">
                            Inscrit
                          </Badge>
                        )}
                      </div>
                      {/* Boutons d'action en bas */}
                      <div className="flex gap-2 mt-3 pt-3 border-t">
                        {/* Bouton info */}
                        <button
                          onClick={(e) => onOpenEventDetails(event, e)}
                          className="flex-1 py-2 px-3 hover:bg-accent rounded-md transition-colors flex items-center justify-center gap-2"
                          title="Voir les détails"
                        >
                          <HelpCircle className="h-4 w-4" />
                          <span className="text-sm">Détails</span>
                        </button>
                        {/* Bouton favori */}
                        {userId && (
                          <button
                            onClick={(e) => onToggleFavorite(event.id, !!isFavorited, e)}
                            className="flex-1 py-2 px-3 hover:bg-accent rounded-md transition-colors flex items-center justify-center gap-2"
                            title={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
                          >
                            <Star 
                              className={cn("h-4 w-4", isFavorited && "fill-yellow-500 text-yellow-500")} 
                            />
                            <span className="text-sm">
                              {isFavorited ? "Favori" : "Favoris"}
                              {event.favoritedBy && event.favoritedBy.length > 0 && (
                                <span className="ml-1 font-medium">({event.favoritedBy.length})</span>
                              )}
                            </span>
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );

                return event.url ? (
                  <Link
                    key={event.id}
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {cardContent}
                  </Link>
                ) : (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                  >
                    {cardContent}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
