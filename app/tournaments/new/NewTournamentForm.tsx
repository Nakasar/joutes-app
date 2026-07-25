"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Valeur sentinelle du Select (un SelectItem ne peut pas avoir une valeur vide).
const NO_GAME = "none";

export function NewTournamentForm({ games }: { games: { id: string; name: string }[] }) {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState(NO_GAME);
  const [allowSelfReporting, setAllowSelfReporting] = useState(true);
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("new.nameRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(gameId !== NO_GAME && { gameId }),
          settings: { allowSelfReporting, requireConfirmation },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("new.createError"));
      }
      const tournament = await res.json();
      router.push(`/tournaments/${tournament.id}/organizer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("new.createError"));
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("new.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tournament-name">{t("new.nameLabel")}</Label>
            <Input
              id="tournament-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("new.namePlaceholder")}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tournament-game">{t("new.gameLabel")}</Label>
            <Select value={gameId} onValueChange={setGameId}>
              <SelectTrigger id="tournament-game" className="w-full" disabled={games.length === 0}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GAME}>{t("new.noGame")}</SelectItem>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="allow-self-reporting">{t("new.selfReportingLabel")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("new.selfReportingHelp")}
              </p>
            </div>
            <Switch
              id="allow-self-reporting"
              checked={allowSelfReporting}
              onCheckedChange={setAllowSelfReporting}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="require-confirmation">{t("new.confirmationLabel")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("new.confirmationHelp")}
              </p>
            </div>
            <Switch
              id="require-confirmation"
              checked={requireConfirmation}
              onCheckedChange={setRequireConfirmation}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? t("new.creating") : t("new.createButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
