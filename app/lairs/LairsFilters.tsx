"use client";

import { useState, useEffect } from "react";
import { Game } from "@/lib/types/Game";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, MapPin, LocateFixed, X } from "lucide-react";
import { useTranslations } from "next-intl";

export type LairsFiltersValues = {
  search: string;
  gameId: string;
  nearLocation?: {
    longitude: number;
    latitude: number;
    maxDistanceKm: number;
  };
};

type LairsFiltersProps = {
  games: Game[];
  filters: LairsFiltersValues;
  onFiltersChange: (filters: LairsFiltersValues) => void;
  isLoading?: boolean;
};

export default function LairsFilters({
  games,
  filters,
  onFiltersChange,
  isLoading,
}: LairsFiltersProps) {
  const t = useTranslations("Lairs");
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [manualCoords, setManualCoords] = useState({ lat: "", lng: "" });
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [distance, setDistance] = useState(filters.nearLocation?.maxDistanceKm?.toString() || "50");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFiltersChange({ ...filters, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onFiltersChange]);

  const handleGameChange = (gameId: string) => {
    onFiltersChange({ ...filters, gameId });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError(t("filters.errors.geolocationNotSupported"));
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        onFiltersChange({
          ...filters,
          nearLocation: {
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
            maxDistanceKm: parseInt(distance) || 50,
          },
        });
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError(t("filters.errors.permissionDenied"));
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError(t("filters.errors.positionUnavailable"));
            break;
          case error.TIMEOUT:
            setGeoError(t("filters.errors.timeout"));
            break;
          default:
            setGeoError(t("filters.errors.generic"));
        }
      }
    );
  };

  const handleManualCoordsSubmit = () => {
    const lat = parseFloat(manualCoords.lat);
    const lng = parseFloat(manualCoords.lng);

    if (isNaN(lat) || isNaN(lng)) {
      setGeoError(t("filters.errors.invalidCoordinates"));
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setGeoError(t("filters.errors.outOfBounds"));
      return;
    }

    setGeoError(null);
    onFiltersChange({
      ...filters,
      nearLocation: {
        longitude: lng,
        latitude: lat,
        maxDistanceKm: parseInt(distance) || 50,
      },
    });
    setShowManualCoords(false);
  };

  const handleClearLocation = () => {
    onFiltersChange({
      ...filters,
      nearLocation: undefined,
    });
    setManualCoords({ lat: "", lng: "" });
  };

  const handleDistanceChange = (newDistance: string) => {
    setDistance(newDistance);
    if (filters.nearLocation) {
      onFiltersChange({
        ...filters,
        nearLocation: {
          ...filters.nearLocation,
          maxDistanceKm: parseInt(newDistance) || 50,
        },
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search by name */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("filters.searchPlaceholder")}
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-10"
            disabled={isLoading}
          />
        </div>

        {/* Filter by game */}
        <div className="w-full sm:w-64">
          <Select value={filters.gameId} onValueChange={handleGameChange} disabled={isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={t("filters.gamePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allGames")}</SelectItem>
              {games.map((game) => (
                <SelectItem key={game.id} value={game.id}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Location filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={filters.nearLocation ? "default" : "outline"}
            size="sm"
            onClick={handleUseMyLocation}
            disabled={isLoading || isLocating}
          >
            <LocateFixed className="h-4 w-4 mr-2" />
            {isLocating ? t("filters.locating") : t("filters.useMyLocation")}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowManualCoords(!showManualCoords)}
            disabled={isLoading}
          >
            <MapPin className="h-4 w-4 mr-2" />
            {t("filters.gpsCoordinates")}
          </Button>

          {filters.nearLocation && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearLocation}
              disabled={isLoading}
            >
              <X className="h-4 w-4 mr-2" />
              {t("filters.clearLocation")}
            </Button>
          )}
        </div>

        {/* Distance selector - only shown when location is active */}
        {(filters.nearLocation || showManualCoords) && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">{t("filters.radius")}</span>
            <Select value={distance} onValueChange={handleDistanceChange} disabled={isLoading}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 km</SelectItem>
                <SelectItem value="10">10 km</SelectItem>
                <SelectItem value="25">25 km</SelectItem>
                <SelectItem value="50">50 km</SelectItem>
                <SelectItem value="100">100 km</SelectItem>
                <SelectItem value="200">200 km</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {geoError && (
        <p className="text-sm text-destructive">{geoError}</p>
      )}

      {/* Manual coordinates input */}
      {showManualCoords && (
        <div className="flex flex-col sm:flex-row gap-2 p-4 bg-muted rounded-lg">
          <Input
            type="number"
            step="any"
            placeholder={t("filters.manualLatPlaceholder")}
            value={manualCoords.lat}
            onChange={(e) => setManualCoords({ ...manualCoords, lat: e.target.value })}
            className="flex-1"
          />
          <Input
            type="number"
            step="any"
            placeholder={t("filters.manualLngPlaceholder")}
            value={manualCoords.lng}
            onChange={(e) => setManualCoords({ ...manualCoords, lng: e.target.value })}
            className="flex-1"
          />
          <Button onClick={handleManualCoordsSubmit} disabled={isLoading}>
            {t("filters.useCoordinates")}
          </Button>
        </div>
      )}
    </div>
  );
}
