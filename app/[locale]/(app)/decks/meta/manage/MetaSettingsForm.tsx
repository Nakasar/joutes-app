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
export function MetaSettingsForm({
  gameId,
  settings,
  sets,
}: {
  gameId: string;
  settings: ResolvedMetaSettings;
  /** Les extensions du jeu, dans l'ordre de sortie, pour dater leur sortie. */
  sets: { setCode: string; name: string }[];
}) {
  const [threshold, setThreshold] = useState(String(Math.round(settings.stapleThreshold * 100)));
  const [minDecks, setMinDecks] = useState(String(settings.minDecksPerDomain));
  const [period, setPeriod] = useState(String(settings.defaultPeriodDays));
  const [releases, setReleases] = useState<Record<string, string>>(settings.setReleases);
  const [saving, startSaving] = useTransition();
  // Une extension datée mais absente de la liste connue (code saisi ailleurs) reste visible.
  const listedSets = [
    ...sets,
    ...Object.keys(settings.setReleases)
      .filter((code) => !sets.some((set) => set.setCode === code))
      .map((setCode) => ({ setCode, name: setCode })),
  ];

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
        setReleases: Object.fromEntries(Object.entries(releases).filter(([, day]) => day)),
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
      {listedSets.length > 0 && (
        <fieldset className="flex flex-col gap-3 border-t border-border pt-5">
          <legend className="sr-only">Sorties d&apos;extension</legend>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Sorties d&apos;extension</span>
            <p className="text-sm text-muted-foreground">
              Les winrates de la méta se comptent par défaut depuis la sortie de la dernière extension, et repartent de zéro à
              chaque sortie. Une extension sans date n&apos;ouvre pas de période.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {listedSets.map((set) => (
              <li key={set.setCode} className="flex items-center justify-between gap-3">
                <Label htmlFor={`release-${set.setCode}`} className="min-w-0 font-normal">
                  <span className="truncate">{set.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{set.setCode}</span>
                </Label>
                <Input
                  id={`release-${set.setCode}`}
                  type="date"
                  value={releases[set.setCode] ?? ""}
                  onChange={(event) => setReleases((previous) => ({ ...previous, [set.setCode]: event.target.value }))}
                  className="w-40 shrink-0"
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
