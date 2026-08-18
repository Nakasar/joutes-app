"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CubeAttributeOption } from "@/lib/db/cube-draw";
import type { CubeDrawConfig, CubeDrawMode, CubeDrawRule } from "@/lib/types/Cube";
import {
  CUBE_DRAW_MAX_CARDS_PER_PLAYER,
  CUBE_DRAW_MAX_PACKS_PER_PLAYER,
  CUBE_DRAW_MAX_RULES,
} from "@/lib/constants/cubes";

type Props = {
  cubeId: string;
  config: CubeDrawConfig;
  attributeOptions: CubeAttributeOption[];
};

export default function DrawSettingsDialog({ cubeId, config, attributeOptions }: Props) {
  const t = useTranslations("Cubes");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CubeDrawMode>(config.mode);
  const [packsPerPlayer, setPacksPerPlayer] = useState(String(config.packsPerPlayer));
  const [cardsPerPlayer, setCardsPerPlayer] = useState(String(config.cardsPerPlayer));
  const [rules, setRules] = useState<CubeDrawRule[]>(config.rules);
  const [allowDuplicates, setAllowDuplicates] = useState(config.allowDuplicates);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode(config.mode);
    setPacksPerPlayer(String(config.packsPerPlayer));
    setCardsPerPlayer(String(config.cardsPerPlayer));
    setRules(config.rules);
    setAllowDuplicates(config.allowDuplicates);
    setError(null);
  };

  const packs = Number.parseInt(packsPerPlayer, 10);
  const cards = Number.parseInt(cardsPerPlayer, 10);
  const ruleTotal = rules.reduce((total, rule) => total + rule.count, 0);
  // Les règles se servent dans le total : le dépassement est signalé avant
  // l'enregistrement, que le serveur refuserait de toute façon.
  const rulesExceedTotal = mode === "random" && Number.isFinite(cards) && ruleTotal > cards;

  const addRule = () => {
    const option = attributeOptions[0];
    if (!option || rules.length >= CUBE_DRAW_MAX_RULES) return;
    setRules((previous) => [...previous, { attribute: option.key, value: option.values[0], count: 1 }]);
  };

  const updateRule = (index: number, changes: Partial<CubeDrawRule>) => {
    setRules((previous) => previous.map((rule, i) => {
      if (i !== index) return rule;
      const next = { ...rule, ...changes };
      // Changer d'attribut invalide la valeur retenue : on repart sur la première.
      if (changes.attribute && changes.attribute !== rule.attribute) {
        next.value = attributeOptions.find((option) => option.key === changes.attribute)?.values[0] ?? "";
      }
      return next;
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cubes/${cubeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draw: {
            mode,
            packsPerPlayer: Number.isFinite(packs) ? packs : config.packsPerPlayer,
            cardsPerPlayer: Number.isFinite(cards) ? cards : config.cardsPerPlayer,
            rules: mode === "random" ? rules : [],
            allowDuplicates,
          },
        }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("saveError"));
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const attributeLabel = (key: string) => (t.has(`stats.attributes.${key}`) ? t(`stats.attributes.${key}`) : key);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings2 className="size-4" />
          {t("draw.configure")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("draw.configureTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label>{t("draw.mode")}</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as CubeDrawMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="packs">{t("draw.modePacks")}</SelectItem>
                <SelectItem value="random">{t("draw.modeRandom")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`draw.mode${mode === "packs" ? "Packs" : "Random"}Hint`)}</p>
          </div>

          {mode === "packs" ? (
            <div className="space-y-1">
              <Label htmlFor="draw-packs">{t("draw.packsPerPlayer")}</Label>
              <Input
                id="draw-packs"
                type="number"
                min={1}
                max={CUBE_DRAW_MAX_PACKS_PER_PLAYER}
                value={packsPerPlayer}
                onChange={(e) => setPacksPerPlayer(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="draw-cards">{t("draw.cardsPerPlayer")}</Label>
                <Input
                  id="draw-cards"
                  type="number"
                  min={1}
                  max={CUBE_DRAW_MAX_CARDS_PER_PLAYER}
                  value={cardsPerPlayer}
                  onChange={(e) => setCardsPerPlayer(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label>{t("draw.rules")}</Label>
                  <span className="text-xs text-muted-foreground">
                    {t("draw.rulesTotal", { count: ruleTotal })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto gap-1"
                    onClick={addRule}
                    disabled={attributeOptions.length === 0 || rules.length >= CUBE_DRAW_MAX_RULES}
                  >
                    <Plus className="size-3.5" />
                    {t("draw.addRule")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {attributeOptions.length === 0 ? t("draw.noAttributes") : t("draw.rulesHint")}
                </p>

                {rules.map((rule, index) => {
                  const option = attributeOptions.find((candidate) => candidate.key === rule.attribute);
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                      <Input
                        type="number"
                        min={1}
                        max={CUBE_DRAW_MAX_CARDS_PER_PLAYER}
                        value={rule.count}
                        onChange={(e) => updateRule(index, { count: Number.parseInt(e.target.value, 10) || 1 })}
                        className="w-20"
                        aria-label={t("draw.ruleCount")}
                      />
                      <Select value={rule.attribute} onValueChange={(value) => updateRule(index, { attribute: value })}>
                        <SelectTrigger className="w-auto min-w-[130px]" aria-label={t("draw.ruleAttribute")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {attributeOptions.map((candidate) => (
                            <SelectItem key={candidate.key} value={candidate.key}>
                              {attributeLabel(candidate.key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={rule.value} onValueChange={(value) => updateRule(index, { value })}>
                        <SelectTrigger className="w-auto min-w-[130px]" aria-label={t("draw.ruleValue")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(option?.values ?? []).map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => setRules((previous) => previous.filter((_, i) => i !== index))}
                        aria-label={t("draw.removeRule")}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}

                {rulesExceedTotal ? (
                  <p className="text-xs text-destructive">{t("draw.rulesExceedTotal")}</p>
                ) : null}
              </div>
            </>
          )}

          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="draw-duplicates">{t("draw.allowDuplicates")}</Label>
              <p className="text-xs text-muted-foreground">{t("draw.allowDuplicatesHint")}</p>
            </div>
            <Switch id="draw-duplicates" checked={allowDuplicates} onCheckedChange={setAllowDuplicates} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} disabled={saving || rulesExceedTotal} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
