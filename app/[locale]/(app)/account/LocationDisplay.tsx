"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Navigation, Trash2, MapPin, Pencil, X, Check, Loader2 } from "lucide-react";
import { updateUserLocation } from "./actions.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import LocationSearchInput from "@/components/LocationSearchInput.tsx";
import { toPlaceRef, type Place, type PlaceRef } from "@/lib/geo/places.ts";

type LocationDisplayProps = {
  currentLatitude?: number;
  currentLongitude?: number;
  /** Localité enregistrée avec les coordonnées, quand elle a été choisie par son nom. */
  currentLabel?: string;
  currentCity?: string;
  currentPostalCode?: string;
};

export default function LocationDisplay({
  currentLatitude,
  currentLongitude,
  currentLabel,
  currentCity,
  currentPostalCode,
}: LocationDisplayProps) {
  const savedPlace: PlaceRef | null = currentLabel
    ? { label: currentLabel, city: currentCity, postalCode: currentPostalCode }
    : null;

  const [latitude, setLatitude] = useState(currentLatitude?.toString() || "");
  const [longitude, setLongitude] = useState(currentLongitude?.toString() || "");
  const [placeQuery, setPlaceQuery] = useState(currentLabel || "");
  /**
   * Localité attachée aux coordonnées du formulaire. Initialisée avec celle
   * déjà enregistrée : réenregistrer une localisation sans y toucher ne doit
   * pas lui faire perdre son nom. Elle n'est détachée que lorsque les
   * coordonnées cessent de venir d'elle — saisie manuelle ou relevé GPS.
   */
  const [attachedPlace, setAttachedPlace] = useState<PlaceRef | null>(savedPlace);
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const hasLocation = currentLatitude !== undefined && currentLongitude !== undefined;

  const handlePlaceSelect = (place: Place) => {
    setAttachedPlace(toPlaceRef(place));
    setLatitude(place.latitude.toString());
    setLongitude(place.longitude.toString());
    setMessage(null);
  };

  const handleCoordinateChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setAttachedPlace(null);
    setPlaceQuery("");
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage({ type: "error", text: "La géolocalisation n'est pas supportée par votre navigateur" });
      return;
    }

    setIsGettingLocation(true);
    setMessage(null);
    setAttachedPlace(null);
    setPlaceQuery("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toString());
        setLongitude(position.coords.longitude.toString());
        setIsGettingLocation(false);
        setMessage({ type: "success", text: "Position récupérée avec succès" });
      },
      (error) => {
        console.error("Erreur de géolocalisation:", error);
        setMessage({ 
          type: "error", 
          text: "Impossible d'obtenir votre position. Veuillez entrer vos coordonnées manuellement." 
        });
        setIsGettingLocation(false);
      }
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    setMessage(null);

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      setMessage({ type: "error", text: "Coordonnées invalides. Veuillez entrer des nombres valides." });
      setIsLoading(false);
      return;
    }

    if (lat < -90 || lat > 90) {
      setMessage({ type: "error", text: "La latitude doit être comprise entre -90 et 90." });
      setIsLoading(false);
      return;
    }

    if (lon < -180 || lon > 180) {
      setMessage({ type: "error", text: "La longitude doit être comprise entre -180 et 180." });
      setIsLoading(false);
      return;
    }

    const result = await updateUserLocation(lat, lon, attachedPlace);

    if (result.success) {
      setMessage({ type: "success", text: "Localisation sauvegardée avec succès" });
      setTimeout(() => {
        setMessage(null);
        setIsDialogOpen(false);
      }, 2000);
    } else {
      setMessage({ type: "error", text: result.error || "Erreur lors de la sauvegarde" });
    }

    setIsLoading(false);
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setMessage(null);

    const result = await updateUserLocation(null, null);

    if (result.success) {
      setLatitude("");
      setLongitude("");
      setPlaceQuery("");
      setAttachedPlace(null);
      setMessage({ type: "success", text: "Localisation supprimée avec succès" });
      setTimeout(() => {
        setMessage(null);
        setIsDialogOpen(false);
      }, 2000);
    } else {
      setMessage({ type: "error", text: result.error || "Erreur lors de la suppression" });
    }

    setIsLoading(false);
  };

  const handleCancel = () => {
    setLatitude(currentLatitude?.toString() || "");
    setLongitude(currentLongitude?.toString() || "");
    setPlaceQuery(currentLabel || "");
    // Annuler, c'est revenir à l'enregistré — y compris à sa localité.
    setAttachedPlace(savedPlace);
    setMessage(null);
    setIsDialogOpen(false);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <div>
            {hasLocation ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ma localisation</p>
                {/* Le nom de la localité prime : c'est ce que l'utilisateur a
                    choisi, et il se relit sans effort. Les coordonnées restent
                    affichées en dessous, elles seules sont exactes. */}
                {currentLabel ? (
                  <>
                    <p className="text-sm font-medium">{currentLabel}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {currentLatitude?.toFixed(4)}, {currentLongitude?.toFixed(4)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-mono">
                    {currentLatitude?.toFixed(4)}, {currentLongitude?.toFixed(4)}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ma localisation</p>
                <p className="text-sm text-muted-foreground italic">Non définie</p>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Modifier
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier ma localisation</DialogTitle>
            <DialogDescription>
              Définissez votre localisation par défaut pour voir les événements autour de vous dans le calendrier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {hasLocation && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Localisation actuelle</p>
                {currentLabel && <p className="text-sm font-medium">{currentLabel}</p>}
                <p className="text-sm font-mono">
                  {currentLatitude?.toFixed(6)}, {currentLongitude?.toFixed(6)}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="location-place" className="text-sm font-medium mb-1.5 block">
                Ville ou code postal
              </label>
              <LocationSearchInput
                id="location-place"
                value={placeQuery}
                onValueChange={setPlaceQuery}
                onSelect={handlePlaceSelect}
                disabled={isLoading || isGettingLocation}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Choisissez une localité : ses coordonnées seront remplies pour vous.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="latitude" className="text-sm font-medium mb-1.5 block">
                  Latitude
                </label>
                <Input
                  id="latitude"
                  type="text"
                  placeholder="48.8566"
                  value={latitude}
                  onChange={(e) => handleCoordinateChange(setLatitude)(e.target.value)}
                  disabled={isLoading || isGettingLocation}
                />
              </div>
              <div>
                <label htmlFor="longitude" className="text-sm font-medium mb-1.5 block">
                  Longitude
                </label>
                <Input
                  id="longitude"
                  type="text"
                  placeholder="2.3522"
                  value={longitude}
                  onChange={(e) => handleCoordinateChange(setLongitude)(e.target.value)}
                  disabled={isLoading || isGettingLocation}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGetCurrentLocation}
              disabled={isLoading || isGettingLocation}
              className="w-full"
            >
              {isGettingLocation ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Localisation en cours...
                </>
              ) : (
                <>
                  <Navigation className="h-4 w-4 mr-2" />
                  Utiliser ma position actuelle
                </>
              )}
            </Button>

            {message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              {hasLocation && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={isLoading}
              >
                <X className="h-4 w-4 mr-2" />
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isLoading || !latitude || !longitude}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Sauvegarder
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
