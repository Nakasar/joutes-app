"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navigation, Trash2, MapPin, Pencil, X, Check, Loader2 } from "lucide-react";
import { updateUserLocation } from "./actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LocationDisplayProps = {
  currentLatitude?: number;
  currentLongitude?: number;
};

export default function LocationDisplay({ currentLatitude, currentLongitude }: LocationDisplayProps) {
  const [latitude, setLatitude] = useState(currentLatitude?.toString() || "");
  const [longitude, setLongitude] = useState(currentLongitude?.toString() || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const hasLocation = currentLatitude !== undefined && currentLongitude !== undefined;

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage({ type: "error", text: "La géolocalisation n&apos;est pas supportée par votre navigateur" });
      return;
    }

    setIsGettingLocation(true);
    setMessage(null);
    
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
          text: "Impossible d&apos;obtenir votre position. Veuillez entrer vos coordonnées manuellement." 
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

    const result = await updateUserLocation(lat, lon);

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
                <p className="text-sm font-mono">
                  {currentLatitude?.toFixed(4)}, {currentLongitude?.toFixed(4)}
                </p>
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
                <p className="text-sm font-mono">
                  {currentLatitude?.toFixed(6)}, {currentLongitude?.toFixed(6)}
                </p>
              </div>
            )}

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
                  onChange={(e) => setLatitude(e.target.value)}
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
                  onChange={(e) => setLongitude(e.target.value)}
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

            <div className="flex gap-2 justify-end pt-2">
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
