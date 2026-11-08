"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { DEFAULT_META_SETTINGS, META_PERIOD_CHOICES, type ResolvedMetaSettings } from "@/lib/meta/settings.ts";
import { saveMetaSettingsAction } from "./actions.ts";

function periodLabel(days: number): string {
  return days === 0 ? "Tout l'échantillon" : `${days} derniers jours`;
}

/** Les réglages des statistiques du jeu : seuil des staples, échantillon minimum, période par défaut. */
export function MetaSettingsForm({ gameId, settings }: { gameId: string; settings: ResolvedMetaSettings }) {
  const [threshold, setThreshold] = useState(String(Math.round(settings.stapleThreshold * 100)));
  const [minDecks, setMinDecks] = useState(String(settings.minDecksPerDomain));
  const [period, setPeriod] = useState(String(settings.defaultPeriodDays));
  const [saving, startSaving] = useTransition();

  const periods: number[] = [...new Set<number>([...META_PERIOD_CHOICES, settings.defaultPeriodDays])].sort(
    (a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)
  );

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveMetaSettingsAction({
        gameId,
        stapleThreshold: Number(threshold) / 100,
        minDecksPerDomain: Number(minDecks),
        defaultPeriodDays: Number(period),
      });
      if (result.ok) toast.success("Réglages enregistrés.");
      else toast.error(result.error);
    });
  };

  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-threshold">Seuil des staples (%)</Label>
        <Input
          id="meta-threshold"
          type="number"
          inputMode="numeric"
          min={5}
          max={100}
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
          className="w-32"
        />
        <p className="text-sm text-muted-foreground">
          Une staple est une carte présente dans au moins cette part des decks qui jouent son ou ses domaines. Une carte
          incolore se compte sur tous les decks. Par défaut : {Math.round(DEFAULT_META_SETTINGS.stapleThreshold * 100)} %.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-min-decks">Decks minimum par domaine</Label>
        <Input
          id="meta-min-decks"
          type="number"
          inputMode="numeric"
          min={1}
          value={minDecks}
          onChange={(event) => setMinDecks(event.target.value)}
          className="w-32"
        />
        <p className="text-sm text-muted-foreground">
          En dessous, le domaine n&apos;a pas de staples : l&apos;échantillon serait trop petit pour conclure.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-period">Période affichée par défaut</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger id="meta-period" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {periodLabel(days)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
