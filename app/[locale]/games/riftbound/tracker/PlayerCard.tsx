"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Zap, Flame } from "lucide-react";
import Counter from "./Counter";
import LegendPicker, { type SelectedLegend } from "./LegendPicker";

export type Player = {
  id: string;
  name: string;
  score: number;
  energy: number;
  power: number;
  legend: SelectedLegend | null;
};

export default function PlayerCard({
  player,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  player: Player;
  index: number;
  canRemove: boolean;
  onChange: (player: Player) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Games.Tracker");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <Input
          value={player.name}
          onChange={(e) => onChange({ ...player, name: e.target.value })}
          placeholder={t("defaultPlayerName", { number: index + 1 })}
          className="text-lg font-semibold"
        />
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="shrink-0 text-destructive"
            aria-label={t("removePlayer")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("legend")}</label>
          <LegendPicker value={player.legend} onChange={(legend) => onChange({ ...player, legend })} />
        </div>

        <div className="flex justify-center">
          <Counter
            label={t("score")}
            value={player.score}
            onChange={(score) => onChange({ ...player, score })}
            size="lg"
          />
        </div>

        <div className="flex justify-center gap-6">
          <Counter
            label={t("energy")}
            value={player.energy}
            onChange={(energy) => onChange({ ...player, energy })}
            icon={<Zap className="h-3 w-3" />}
          />
          <Counter
            label={t("power")}
            value={player.power}
            onChange={(power) => onChange({ ...player, power })}
            icon={<Flame className="h-3 w-3" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}
