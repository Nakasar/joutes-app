"use client";

import { useState, useEffect } from "react";
import { Event } from "@/lib/types/Event";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock, Gamepad2, Euro, User2Icon, Users, Star, Lock } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EventDetailsModalProps = {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreatorOrOwner?: boolean;
  userId?: string;
};

type FavoritedUser = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
};

export default function EventDetailsModal({ 
  event, 
  open, 
  onOpenChange,
  isCreatorOrOwner = false,
  userId
}: EventDetailsModalProps) {
  const [favoritedUsers, setFavoritedUsers] = useState<FavoritedUser[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);

  const startDate = DateTime.fromISO(event.startDateTime);
  const endDate = DateTime.fromISO(event.endDateTime);
  const duration = endDate.diff(startDate, ['hours', 'minutes']);

  const isFavorited = userId && event.favoritedBy?.includes(userId);
  const isParticipant = userId && event.participants?.includes(userId);
  const isCreator = userId && event.creatorId === userId;
  const isPrivate = !event.lairId;

  // Charger les utilisateurs qui ont mis en favori si l'utilisateur a les droits
  useEffect(() => {
    if (open && isCreatorOrOwner && event.favoritedBy && event.favoritedBy.length > 0) {
      setLoadingFavorites(true);
      fetch(`/api/events/${event.id}/favorited-users`)
        .then(res => res.json())
        .then(data => {
          if (data.users) {
            setFavoritedUsers(data.users);
          }
        })
        .catch(error => {
          console.error("Erreur lors du chargement des favoris:", error);
        })
        .finally(() => {
          setLoadingFavorites(false);
        });
    }
  }, [open, isCreatorOrOwner, event.favoritedBy, event.id]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2 flex-wrap">
                {event.name}
                {isPrivate && (
                  <Badge variant="secondary" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Privé
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-2 flex items-center gap-2">
                <Gamepad2 className="h-4 w-4" />
                {event.gameName}
              </DialogDescription>
            </div>
            <Badge variant={getStatusVariant(event.status)}>
              {getStatusLabel(event.status)}
            </Badge>
          </div>

          {/* Badges utilisateur */}
          {userId && (
            <div className="flex flex-wrap gap-2 mt-3">
              {isCreator && (
                <Badge variant="default" className="bg-blue-500 text-white">
                  Créateur
                </Badge>
              )}
              {isParticipant && (
                <Badge variant="default" className="bg-green-500 text-white">
                  Inscrit
                </Badge>
              )}
              {isFavorited && (
                <Badge variant="default" className="bg-yellow-500 text-foreground">
                  <Star className="h-3 w-3 mr-1 fill-current" />
                  Favori
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Date et heure */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date et heure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Début</p>
                  <p className="text-muted-foreground" suppressHydrationWarning>
                    {startDate.setLocale('fr').toLocaleString(DateTime.DATETIME_FULL)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Fin</p>
                  <p className="text-muted-foreground" suppressHydrationWarning>
                    {endDate.setLocale('fr').toLocaleString(DateTime.DATETIME_FULL)}
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground">
                Durée : {duration.hours.toFixed(0)}h{duration.minutes > 0 ? ` ${Math.round(duration.minutes)}min` : ''}
              </p>
            </CardContent>
          </Card>

          {/* Lieu */}
          {event.lair && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Lieu
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Link href={`/lairs/${event.lair.id}`} className="font-medium hover:underline">
                  {event.lair.name}
                </Link>
                {event.lair.address && (
                  <p className="text-muted-foreground mt-1">{event.lair.address}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Créateur */}
          {event.creator && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User2Icon className="h-4 w-4" />
                  Créateur
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Link 
                  href={`/users/${event.creator.displayName}${event.creator.discriminator}`}
                  className="font-medium hover:underline"
                >
                  {event.creator.displayName ? `${event.creator.displayName}#${event.creator.discriminator}` : 'Utilisateur inconnu'}
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Prix */}
          {event.price !== undefined && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Euro className="h-4 w-4" />
                  Prix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">
                  {(!event.price || event.price === 0) ? 'Gratuit' : `${event.price.toFixed(2)} €`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Participants */}
          {(event.participants || event.maxParticipants) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Participants
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-muted-foreground">
                  {event.participants?.length || 0}
                  {event.maxParticipants && ` / ${event.maxParticipants}`} inscrit(s)
                </p>
              </CardContent>
            </Card>
          )}

          {/* Section Gestion (uniquement pour créateur ou propriétaire du lair) */}
          {isCreatorOrOwner && (
            <Card className="border-primary/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  Gestion - Utilisateurs ayant mis en favori
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFavorites ? (
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                ) : favoritedUsers.length > 0 ? (
                  <div className="space-y-2">
                    {favoritedUsers.map((user) => (
                      <div key={user.id} className="flex items-center gap-2 text-sm">
                        <User2Icon className="h-4 w-4 text-muted-foreground" />
                        <Link
                          href={`/users/${user.displayName}${user.discriminator}`}
                          className="hover:underline"
                        >
                          {user.displayName ? `${user.displayName}#${user.discriminator}` : user.username}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun utilisateur n&apos;a mis cet événement en favori
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lien vers la page complète */}
          <div className="pt-2">
            <Link
              href={event.url || `/events/${event.id}`}
              className="text-sm text-primary hover:underline"
              target={event.url ? "_blank" : undefined}
              rel={event.url ? "noopener noreferrer" : undefined}
            >
              Voir la page complète de l&apos;événement →
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
