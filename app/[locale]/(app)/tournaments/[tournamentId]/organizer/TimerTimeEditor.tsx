"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

// Bornes du minuteur, alignées sur `timerActionSchema` côté API.
const MAX_SECONDS = 86400;

/**
 * Réglage direct du temps affiché au minuteur, pour les cas que « + 2 min » ne
 * couvre pas : ronde plus courte annoncée en salle, rattrapage après un départ
 * tardif, temps réduit sur une finale. Ouvre sur le temps courant, en minutes
 * et secondes, plutôt que de faire recompter l'organisateur.
 */
export function TimerTimeEditor({
  currentSeconds,
  disabled,
  variant = "outline",
  className,
  onApply,
}: {
  /** Temps affiché à l'ouverture ; négatif (minuteur épuisé) revient à zéro. */
  currentSeconds: number | null;
  disabled?: boolean;
  variant?: "outline" | "secondary";
  className?: string;
  onApply: (seconds: number) => void | Promise<void>;
}) {
  const t = useTranslations("Tournaments");
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("0");
  const [seconds, setSeconds] = useState("0");

  const openWithCurrent = () => {
    const base = Math.max(0, Math.round(currentSeconds ?? 0));
    setMinutes(String(Math.floor(base / 60)));
    setSeconds(String(base % 60));
    setOpen(true);
  };

  const parsed = (() => {
    const m = Number.parseInt(minutes, 10);
    const s = Number.parseInt(seconds, 10);
    const total = (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
    return total;
  })();
  const valid = parsed >= 1 && parsed <= MAX_SECONDS;

  const apply = async () => {
    if (!valid) return;
    await onApply(parsed);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={className}
        onClick={openWithCurrent}
        disabled={disabled}
      >
        <Clock className="size-3.5" />
        {t("timerManager.setTime")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("timerManager.setTimeTitle")}</DialogTitle>
            <DialogDescription>{t("timerManager.setTimeDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="timer-minutes">{t("timerManager.minutes")}</Label>
              <Input
                id="timer-minutes"
                type="number"
                min={0}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timer-seconds">{t("timerManager.seconds")}</Label>
              <Input
                id="timer-seconds"
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </div>
          </div>

          {!valid && <p className="text-sm text-destructive">{t("timerManager.minDuration")}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={apply} disabled={!valid || disabled}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
