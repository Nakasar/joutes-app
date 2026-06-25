"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Calendar, MapPin } from "lucide-react";
import { createEventAction } from "./actions";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import { useTranslations } from "next-intl";

type EventFormProps = {
  ownedLairs: Lair[];
  games: Game[];
};

export default function EventForm({ ownedLairs, games }: EventFormProps) {
  const router = useRouter();
  const t = useTranslations("EventCreate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    startDateTime: "",
    endDateTime: "",
    gameName: "",
    lairId: "",
    url: "",
    price: "",
    maxParticipants: "",
    preRegistration: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createEventAction({
        name: formData.name,
        startDateTime: formData.startDateTime,
        endDateTime: formData.endDateTime,
        gameName: formData.gameName,
        lairId: formData.lairId || undefined,
        url: formData.url || undefined,
        price: formData.price ? parseFloat(formData.price) : undefined,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants, 10) : undefined,
        preRegistration: formData.preRegistration,
      });

      if (result.success) {
        router.push(`/events/${result.eventId}`);
        router.refresh();
      } else {
        setError(result.error || t("form.errors.generic"));
      }
    } catch (err) {
      console.error(err);
      setError(t("form.errors.createFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t("form.title")}
        </CardTitle>
        <CardDescription>
          {ownedLairs.length > 0
            ? t("form.descriptionWithLairs")
            : t("form.descriptionWithoutLairs")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              {t("form.fields.name.label")}
            </label>
            <Input
              id="name"
              required
              maxLength={500}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("form.fields.name.placeholder")}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="gameName" className="text-sm font-medium">
              {t("form.fields.game.label")}
            </label>
            <Select
              value={formData.gameName}
              onValueChange={(value) => setFormData({ ...formData, gameName: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("form.fields.game.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.name}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ownedLairs.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="lairId" className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {t("form.fields.lair.label")}
              </label>
              <Select
                value={formData.lairId}
                onValueChange={(value) => setFormData({ ...formData, lairId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("form.fields.lair.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {ownedLairs.map((lair) => (
                    <SelectItem key={lair.id} value={lair.id}>
                      {lair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("form.fields.lair.help")}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="startDateTime" className="text-sm font-medium">
                {t("form.fields.startDate.label")}
              </label>
              <Input
                id="startDateTime"
                type="datetime-local"
                required
                value={formData.startDateTime}
                onChange={(e) => setFormData({ ...formData, startDateTime: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="endDateTime" className="text-sm font-medium">
                {t("form.fields.endDate.label")}
              </label>
              <Input
                id="endDateTime"
                type="datetime-local"
                required
                value={formData.endDateTime}
                onChange={(e) => setFormData({ ...formData, endDateTime: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="url" className="text-sm font-medium">
              {t("form.fields.url.label")}
            </label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder={t("form.fields.url.placeholder")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="price" className="text-sm font-medium">
                {t("form.fields.price.label")}
              </label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder={t("form.fields.price.placeholder")}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="maxParticipants" className="text-sm font-medium">
                {t("form.fields.maxParticipants.label")}
              </label>
              <Input
                id="maxParticipants"
                type="number"
                min="1"
                value={formData.maxParticipants}
                onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
                placeholder={t("form.fields.maxParticipants.placeholder")}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="preRegistration"
              checked={formData.preRegistration}
              onChange={(e) => setFormData({ ...formData, preRegistration: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="preRegistration" className="text-sm font-medium">
              {t("form.fields.preRegistration.label")}
            </label>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {t("form.fields.preRegistration.help")}
          </p>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? t("form.actions.creating") : t("form.actions.create")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              {t("form.actions.cancel")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
