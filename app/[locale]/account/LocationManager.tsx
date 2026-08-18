"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navigation, Trash2, Save, MapPin } from "lucide-react";
import { updateUserLocation } from "./actions";

type LocationManagerProps = {
  currentLatitude?: number;
  currentLongitude?: number;
};

export default function LocationManager({ currentLatitude, currentLongitude }: LocationManagerProps) {
  const [latitude, setLatitude] = useState(currentLatitude?.toString() || "");
  const [longitude, setLongitude] = useState(currentLongitude?.toString() || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    } else {
      setMessage({ type: "error", text: result.error || "Erreur lors de la suppression" });
    }

    setIsLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 mt-0.5" />
        <p>
          Définissez votre localisation par défaut pour voir les événements autour de vous. 
          Cette information sera utilisée par le calendrier quand vous cliquez sur &quot;Autour de moi&quot;.
        </p>
      </div>

      {hasLocation && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Localisation actuelle :</p>
          <p className="text-sm font-mono">
            {currentLatitude?.toFixed(6)}, {currentLongitude?.toFixed(6)}
          </p>
        </div>
      )}

      <div className="space-y-3">
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleGetCurrentLocation}
            disabled={isLoading || isGettingLocation}
            className="flex-1 sm:flex-none"
          >
            <Navigation className="h-4 w-4 mr-2" />
            {isGettingLocation ? "Localisation..." : "Utiliser ma position"}
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !latitude || !longitude}
            className="flex-1 sm:flex-none"
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Sauvegarde..." : "Sauvegarder"}
          </Button>

          {hasLocation && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </Button>
          )}
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
