"use client";

import { Event } from "@/lib/types/Event";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Gamepad2, Euro, Filter, List, CalendarDays, Clock, Navigation, X, User2Icon, AlertCircle, CheckCircle, Star, HelpCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { DateTime } from "luxon";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import EventDetailsModal from "./EventDetailsModal";
import { Game } from "@/lib/types/Game";
import { toggleEventFavoriteAction } from "./actions";
import { updateUserLocation } from "../account/actions";
import {useTranslations, useLocale} from "next-intl";

type EventsCalendarProps = {
  events: Event[];
  isLoading?: boolean;
  showViewToggle?: boolean;
  currentMonth?: number;
  currentYear?: number;
  gameId?: string;
  availableGames?: Game[];
  onMonthChange?: (month: number, year: number) => void;
  onGameIdChange?: (gameId: string) => void;
  onLocationSearch?: (latitude: number, longitude: number, distance: number) => void;
  onResetLocation?: () => void;
  isLocationMode?: boolean;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
};

// Nombre maximal d'événements affichés dans une case du calendrier avant de replier
const MAX_VISIBLE_EVENTS = 3;

// Classe de bordure gauche selon le statut de l'événement
const getStatusBorderClass = (status: Event["status"]) =>
  status === "available"
    ? "border-l-emerald-500"
    : status === "sold-out"
      ? "border-l-red-500"
      : "border-l-muted-foreground/40";

// Classe de pastille de couleur selon le statut
const getStatusDotClass = (status: Event["status"]) =>
  status === "available"
    ? "bg-emerald-500"
    : status === "sold-out"
      ? "bg-red-500"
      : "bg-muted-foreground/50";

export default function EventsCalendar({
  events,
  isLoading = false,
  showViewToggle = true,
  currentMonth: controlledMonth,
  currentYear: controlledYear,
  gameId: controlledGameId,
  availableGames = [],
  onMonthChange,
  onGameIdChange,
  onLocationSearch,
  onResetLocation,
  isLocationMode = false,
  userLocation,
}: EventsCalendarProps) {
  const locale = useLocale();
  const t = useTranslations('EventsCalendar');

  const today = DateTime.now();
  const [internalMonth, setInternalMonth] = useState<number>(today.month);
  const [internalYear, setInternalYear] = useState<number>(today.year);
  const [internalGameId, setInternalGameId] = useState<string>("followed");
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

  // État pour la fenêtre listant tous les événements d'un jour (débordement du calendrier)
  const [dayDialogDay, setDayDialogDay] = useState<number | null>(null);

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
  const gameId = controlledGameId !== undefined ? controlledGameId : internalGameId;

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

  const handleGameIdChange = (newGameId: string) => {
    if (onGameIdChange) {
      onGameIdChange(newGameId);
    } else {
      setInternalGameId(newGameId);
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
        title: "Coordonnées invalides",
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
        message: "Utilisez le format: latitude, longitude (ex: 48.8566, 2.3522)"
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
      const lair = event.lair as { owners?: string[] };
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
    return [...events].sort((a, b) => {
      const dateA = DateTime.fromISO(a.startDateTime);
      const dateB = DateTime.fromISO(b.startDateTime);
      return dateA.toMillis() - dateB.toMillis();
    });
  }, [events]);

  // Organiser les événements par jour
  const eventsByDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    eventsInMonth.forEach((event) => {
      const day = DateTime.fromISO(event.startDateTime).day;
      if (!map.has(day)) {
        map.set(day, []);
      }
      map.get(day)?.push(event);
    });
    return map;
  }, [eventsInMonth]);

  // Grouper les événements par jour pour la vue liste (mobile)
  // Ne montrer que les événements à partir du jour actuel
  const eventsByDayForList = useMemo(() => {
    const grouped = new Map<string, Event[]>();
    const todayStart = today.startOf('day');

    eventsInMonth.forEach((event) => {
      const eventDate = DateTime.fromISO(event.startDateTime);

      // Ne garder que les événements à partir d'aujourd'hui
      if (eventDate >= todayStart) {
        const dayKey = eventDate.setLocale(locale).toLocaleString({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsInMonth, locale]);

  // Libellé du mois localisé (corrige l'affichage figé en français)
  const monthLabel = DateTime.local(currentYear, currentMonth, 1)
    .setLocale(locale)
    .toLocaleString({ month: "long", year: "numeric" });

  const isCurrentMonth = currentMonth === today.month && currentYear === today.year;

  // Noms des jours de la semaine (clés de traduction)
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  // Générer les jours du calendrier (avec les cases vides au début)
  const calendarDays: (number | null)[] = [];
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

  // Rendu d'une pastille d'événement compacte (vue calendrier + fenêtre jour)
  // showTime : afficher l'heure en ligne (utile dans la fenêtre du jour, plus large)
  const renderEventPill = (event: Event, showTime = false) => {
    const startTime = DateTime.fromISO(event.startDateTime)
      .setZone('Europe/Paris')
      .toLocaleString(DateTime.TIME_24_SIMPLE);
    const isFavorited = localFavorites[event.id] !== undefined
      ? localFavorites[event.id]
      : event.favoritedBy?.includes(session.data?.user?.id || "");
    const isUserEvent = session.data?.user?.id && (
      event.creatorId === session.data?.user?.id ||
      event.participants?.includes(session.data?.user?.id || "") ||
      isFavorited
    );

    const inner = (
      <div
        className={cn(
          "group/pill relative flex items-center gap-1.5 overflow-hidden rounded-md border border-l-[3px] bg-card py-1 pl-1.5 pr-1.5 text-xs shadow-sm transition-all hover:bg-accent hover:shadow",
          getStatusBorderClass(event.status),
          isUserEvent && "ring-1 ring-amber-400/60",
        )}
        title={`${startTime} · ${event.name}`}
      >
        {event.game?.icon ? (
          <img
            src={event.game.icon}
            alt=""
            className="h-3.5 w-3.5 shrink-0 rounded object-cover"
          />
        ) : (
          <span className={cn("h-2 w-2 shrink-0 rounded-full", getStatusDotClass(event.status))} />
        )}
        {showTime && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground" suppressHydrationWarning>
            {startTime}
          </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            event.status === "cancelled" && "text-muted-foreground line-through",
          )}
        >
          {event.name}
        </span>

        {/* Actions révélées au survol */}
        <span className="absolute right-0.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded bg-card/95 pl-1 shadow-sm group-hover/pill:flex">
          <button
            type="button"
            onClick={(e) => handleOpenEventDetails(event, e)}
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            title={t('event.seeDetails')}
            aria-label={t('event.seeDetails')}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
          {session.data?.user && (
            <button
              type="button"
              onClick={(e) => handleToggleFavorite(event.id, !!isFavorited, e)}
              className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              title={isFavorited ? t('event.favoriteRemove') : t('event.favoriteAdd')}
              aria-label={isFavorited ? t('event.favoriteRemove') : t('event.favoriteAdd')}
            >
              <Star className={cn("h-3.5 w-3.5", isFavorited && "fill-amber-400 text-amber-400")} />
            </button>
          )}
        </span>
      </div>
    );

    return event.url ? (
      <Link key={event.id} href={event.url} target="_blank" rel="noopener noreferrer">
        {inner}
      </Link>
    ) : (
      <Link key={event.id} href={`/events/${event.id}`}>
        {inner}
      </Link>
    );
  };

  const dayDialogEvents = dayDialogDay !== null ? eventsByDay.get(dayDialogDay) ?? [] : [];
  const dayDialogLabel = dayDialogDay !== null
    ? DateTime.local(currentYear, currentMonth, dayDialogDay).setLocale(locale).toLocaleString(DateTime.DATE_HUGE)
    : "";

  return (
    <>
    <div className="space-y-6">
      {/* En-tête avec navigation */}
      <Card className="overflow-hidden">
        <CardHeader className="gap-4">
          {/* Navigation mois : chevrons compacts + titre localisé */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <Button
              size="icon"
              variant="outline"
              onClick={goToPreviousMonth}
              aria-label={t('filters.previousMonth')}
              title={t('filters.previousMonth')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="min-w-0 flex-1 text-center">
              <CardTitle className="truncate text-xl capitalize sm:text-2xl">
                {monthLabel}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('monthEventsCount', { count: events.length })}
              </p>
              {!isCurrentMonth && (
                <Button
                  onClick={goToCurrentMonth}
                  variant="link"
                  className="mt-0.5 h-auto p-0 text-xs"
                >
                  {t('filters.today')}
                </Button>
              )}
            </div>

            <Button
              size="icon"
              variant="outline"
              onClick={goToNextMonth}
              aria-label={t('filters.nextMonth')}
              title={t('filters.nextMonth')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Barre d'outils */}
          {showViewToggle && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {/* Segmented control vue calendrier/liste */}
                <div className="inline-flex rounded-lg border bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("calendar")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      viewMode === "calendar"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={viewMode === "calendar"}
                  >
                    <CalendarDays className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('views.calendar')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      viewMode === "list"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={viewMode === "list"}
                  >
                    <List className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('views.list')}</span>
                  </button>
                </div>

                {/* Boutons spécifiques aux utilisateurs connectés */}
                {!session.isPending && session.data?.user && (
                  <>
                    {/* Sélecteur de filtre par jeu */}
                    <div className="w-full sm:w-auto sm:min-w-[220px]">
                      <Select value={gameId} onValueChange={handleGameIdChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('filters.filterByGame')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="followed">
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4" />
                              {t('filters.myGames')}
                            </div>
                          </SelectItem>
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <Gamepad2 className="h-4 w-4" />
                              {t('filters.allGames')}
                            </div>
                          </SelectItem>
                          {availableGames.length > 0 && (
                            <>
                              <div className="my-1 border-t"></div>
                              {availableGames.map((game) => (
                                <SelectItem key={game.id} value={game.id}>
                                  <div className="flex items-center gap-2">
                                    {game.icon && (
                                      <img
                                        src={game.icon}
                                        alt=""
                                        className="h-4 w-4 object-contain"
                                      />
                                    )}
                                    {game.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Bouton Mes lieux (mode normal) */}
                    {isLocationMode && (
                      <Button
                        variant="default"
                        onClick={handleResetLocation}
                        className="w-full sm:w-auto"
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        {t('filters.myLairs')}
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
                    {t('filters.nearMe')}
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
                    {t('filters.geolocUpdate')}
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
                      {t('filters.ctaLoginCustomize')}
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
                        <div className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p className="mb-1 font-medium">{t('filters.geolocSaved')}</p>
                          <p className="text-muted-foreground">
                            {t('filters.geolocDetails')} {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          {t('filters.geolocCoordinates')}
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
                              <>{t('filters.geolocPending')}</>
                            ) : (
                              <>
                                <Navigation className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {userLocation
                            ? t('filters.geolocUseSaved')
                            : t('filters.geolocInputHelp')
                          }
                        </p>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          {t('filters.geolocMaxDistance')}
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

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={handleLocationSearch}
                          className="flex-1"
                        >
                          <Navigation className="mr-2 h-4 w-4" />
                          {t('filters.geolocSearch')}
                        </Button>

                        {session.data?.user && (
                          <Button
                            variant="secondary"
                            onClick={handleSaveLocation}
                            disabled={isSavingLocation || !coordinates.trim()}
                            className="flex-1"
                          >
                            <MapPin className="mr-2 h-4 w-4" />
                            {isSavingLocation ? t('filters.geolocSaving') : t('filters.geolocSave')}
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
        </CardHeader>
      </Card>

      {/* Zone de contenu (avec superposition de chargement) */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-start justify-center rounded-lg bg-background/60 pt-24 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          </div>
        )}

        <div className={cn("transition-opacity", isLoading && "pointer-events-none opacity-50")}>
          {/* Vue calendrier */}
          {viewMode === "calendar" && (
            <Card>
              <CardContent className="p-2 sm:p-4">
                {/* En-têtes des jours de la semaine */}
                <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
                  {dayNames.map((dayName, i) => (
                    <div
                      key={dayName}
                      className={cn(
                        "py-2 text-center text-xs font-semibold uppercase tracking-wide sm:text-sm",
                        i >= 5 ? "text-muted-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {t(`CalendarView.weekDays.${dayName}`)}
                    </div>
                  ))}
                </div>

                {/* Jours du calendrier */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {calendarDays.map((day, index) => {
                    const dayEvents = day !== null ? eventsByDay.get(day) ?? [] : [];
                    const columnIndex = index % 7;
                    const isWeekend = columnIndex >= 5;
                    const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
                    const hiddenCount = dayEvents.length - visibleEvents.length;

                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex min-h-[96px] flex-col rounded-lg border p-1 transition-colors sm:min-h-[120px] sm:p-1.5",
                          day === null
                            ? "border-transparent bg-transparent"
                            : isToday(day)
                              ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                              : isWeekend
                                ? "border-transparent bg-muted/40 hover:border-border"
                                : "bg-card hover:border-muted-foreground/30",
                        )}
                      >
                        {day !== null && (
                          <>
                            <div className="mb-1 flex items-center justify-between px-0.5">
                              <span
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:text-sm",
                                  isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground",
                                )}
                              >
                                {day}
                              </span>
                              {dayEvents.length > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {dayEvents.length}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              {visibleEvents.map((event) => renderEventPill(event))}
                              {hiddenCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setDayDialogDay(day)}
                                  className="rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  {t('CalendarView.more', { count: hiddenCount })}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vue liste */}
          {viewMode === "list" && (
            <ListView
              eventsInMonth={eventsInMonth}
              eventsByDayForList={eventsByDayForList}
              today={today}
              userId={session.data?.user?.id}
              getStatusVariant={getStatusVariant}
              localFavorites={localFavorites}
              onToggleFavorite={handleToggleFavorite}
              onOpenEventDetails={handleOpenEventDetails}
            />
          )}
        </div>
      </div>
    </div>

    {/* Fenêtre listant tous les événements d'un jour */}
    <Dialog open={dayDialogDay !== null} onOpenChange={(open) => !open && setDayDialogDay(null)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">{dayDialogLabel}</DialogTitle>
          <DialogDescription>
            {t('CalendarView.dayEventsCount', { count: dayDialogEvents.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {dayDialogEvents.map((event) => renderEventPill(event, true))}
        </div>
      </DialogContent>
    </Dialog>

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
  localFavorites,
  onToggleFavorite,
  onOpenEventDetails
}: ListViewProps) {
  const t = useTranslations("EventsCalendar");

  if (eventsInMonth.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <CalendarIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-muted-foreground">
            {t('ListView.noEventsThisMonth')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (eventsByDayForList.size === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <CalendarIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-muted-foreground">
            {t('ListView.noUpcomingEvents')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(eventsByDayForList.entries()).map(([dayKey, dayEvents]) => {
        const firstEventDate = DateTime.fromISO(dayEvents[0].startDateTime);
        const isEventToday = firstEventDate.hasSame(today, 'day');
        const isEventTomorrow = firstEventDate.hasSame(today.plus({ days: 1 }), 'day');
        const relLabel = isEventToday
          ? t('ListView.today')
          : isEventTomorrow
            ? t('ListView.tomorrow')
            : null;

        return (
          <div key={dayKey} className="space-y-3">
            {/* En-tête du jour (sticky, effet verre) */}
            <div className="sticky top-16 z-10 flex items-center gap-2 rounded-lg border bg-background/85 px-4 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70">
              <CalendarIcon className={cn("h-4 w-4 shrink-0", isEventToday ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate font-semibold capitalize">{dayKey}</span>
              {relLabel && (
                <Badge variant={isEventToday ? "default" : "secondary"} className="shrink-0">
                  {relLabel}
                </Badge>
              )}
              <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {t('ListView.eventsCount', { count: dayEvents.length })}
              </span>
            </div>

            {/* Événements du jour */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                  event.participants?.includes(userId) ||
                  isFavorited
                );

                const cardContent = (
                  <Card
                    className={cn(
                      "h-full gap-0 overflow-hidden border-l-4 py-0 transition-all hover:shadow-md",
                      getStatusBorderClass(event.status),
                      isUserEvent && "ring-1 ring-amber-400/50",
                      event.url && "cursor-pointer hover:bg-accent/40",
                    )}
                  >
                    {/* Bannière du jeu */}
                    {event.game?.banner && (
                      <div className="relative h-24 overflow-hidden">
                        <img
                          src={event.game.banner}
                          alt={event.game.name}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                        {event.game && (
                          <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
                            {event.game.icon && (
                              <img
                                src={event.game.icon}
                                alt=""
                                className="h-7 w-7 rounded object-cover shadow-lg ring-1 ring-white/20"
                              />
                            )}
                            <span className="truncate text-sm font-bold text-white drop-shadow-lg">
                              {event.game.name}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 p-4">
                      {/* Icône et nom du jeu uniquement si pas de bannière */}
                      {event.game && !event.game.banner && (
                        <div className="flex items-center gap-2">
                          {event.game.icon && (
                            <img
                              src={event.game.icon}
                              alt=""
                              className="h-6 w-6 rounded object-cover shadow-sm"
                            />
                          )}
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {event.game.name}
                          </span>
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg leading-tight">
                          {event.name}
                        </CardTitle>
                        <Badge variant={getStatusVariant(event.status)} className="shrink-0">
                          {t(`event.status.${event.status}`)}
                        </Badge>
                      </div>

                      {/* Métadonnées */}
                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                        <div className="flex items-center gap-2" suppressHydrationWarning>
                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{timeStr} – {endTimeStr}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          <span>{t('event.duration', { duration: endDate.diff(eventDate, 'hours').hours.toFixed(1) })}</span>
                        </div>
                        {event.creator ? (
                          <div className="flex items-center gap-2">
                            <User2Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">
                              {event.creator.displayName ? `${event.creator.displayName}#${event.creator.discriminator}` : t('event.unknownUser')}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">
                              {event.lair?.name || t('event.unknownLair')}
                            </span>
                          </div>
                        )}
                        {!event.game && event.gameName && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Gamepad2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">{event.gameName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Euro className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-semibold">
                            {(!event.price || event.price === 0) ? t('event.free') : `${event.price}€`}
                          </span>
                        </div>
                      </div>

                      {/* Badges de relation utilisateur */}
                      {(userId && (event.creatorId === userId || event.participants?.includes(userId))) && (
                        <div className="flex flex-wrap gap-1.5">
                          {event.creatorId === userId && (
                            <Badge className="bg-blue-500 text-white hover:bg-blue-500">
                              {t('event.creator')}
                            </Badge>
                          )}
                          {event.participants?.includes(userId) && (
                            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
                              {t('event.registered')}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Boutons d'action */}
                      <div className="mt-auto flex gap-2 border-t pt-3">
                        <button
                          type="button"
                          onClick={(e) => onOpenEventDetails(event, e)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                          title={t('event.seeDetails')}
                        >
                          <HelpCircle className="h-4 w-4" />
                          <span>{t('event.details')}</span>
                        </button>
                        {userId && (
                          <button
                            type="button"
                            onClick={(e) => onToggleFavorite(event.id, !!isFavorited, e)}
                            className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                            title={isFavorited ? t('event.favoriteRemove') : t('event.favoriteAdd')}
                          >
                            <Star className={cn("h-4 w-4", isFavorited && "fill-amber-400 text-amber-400")} />
                            <span>
                              {isFavorited ? t('event.inFavorite') : t('event.favorite')}
                              {event.favoritedBy && event.favoritedBy.length > 0 && (
                                <span className="ml-1 font-semibold">({event.favoritedBy.length})</span>
                              )}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                );

                return event.url ? (
                  <Link
                    key={event.id}
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {cardContent}
                  </Link>
                ) : (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="block"
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
