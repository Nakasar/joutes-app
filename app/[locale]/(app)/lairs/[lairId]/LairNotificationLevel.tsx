"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { updateLairNotificationPreferenceAction } from "@/app/[locale]/(app)/account/actions.ts";
import {
  LAIR_NOTIFICATION_CATEGORIES,
  LAIR_NOTIFICATION_LEVELS,
  type LairNotificationCategory,
  type LairNotificationLevel as Level,
  type LairNotificationPreference,
} from "@/lib/lairs/notification-prefs.ts";

const LEVEL_ICONS = { all: BellRing, custom: Bell, none: BellOff } as const;

/**
 * Ce qu'on reçoit d'un lieu qu'on suit : tout, une sélection, ou rien.
 *
 * Chaque choix s'enregistre aussitôt, sans bouton « Enregistrer » : c'est un
 * interrupteur, pas un formulaire. Passer en « Personnalisé » part de tous les
 * types cochés — c'est ce que l'on recevait jusque-là en « Tout » — pour qu'on
 * n'ait qu'à décocher ce qu'on ne veut plus.
 */
export default function LairNotificationLevel({
  lairId,
  initialPreference,
  size = "sm",
  className,
}: {
  lairId: string;
  initialPreference: LairNotificationPreference;
  size?: "sm" | "icon";
  className?: string;
}) {
  const t = useTranslations("Lairs.notificationLevel");
  const id = useId();
  const [preference, setPreference] = useState(initialPreference);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = (next: LairNotificationPreference) => {
    const previous = preference;
    setPreference(next);
    setError(null);
    startTransition(async () => {
      const result = await updateLairNotificationPreferenceAction(lairId, next);
      if (!result.success) {
        setPreference(previous);
        setError(result.error || t("error"));
      }
    });
  };

  const chooseLevel = (level: Level) => {
    if (level === preference.level) return;
    save(level === "custom" ? { level, categories: [...LAIR_NOTIFICATION_CATEGORIES] } : { level });
  };

  const toggleCategory = (category: LairNotificationCategory, checked: boolean) => {
    if (preference.level !== "custom") return;
    const categories = checked
      ? [...preference.categories, category]
      : preference.categories.filter((value) => value !== category);
    save({ level: "custom", categories });
  };

  const Icon = LEVEL_ICONS[preference.level];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size={size}
          variant="secondary"
          className={className}
          aria-label={t("trigger", { level: t(`levels.${preference.level}.label`) })}
          title={t("trigger", { level: t(`levels.${preference.level}.label`) })}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>

        <div role="radiogroup" aria-label={t("title")} className="space-y-1">
          {LAIR_NOTIFICATION_LEVELS.map((level) => {
            const LevelIcon = LEVEL_ICONS[level];
            const selected = preference.level === level;
            return (
              <div key={level} className="space-y-2">
                <label
                  htmlFor={`${id}-${level}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 text-sm transition-colors ${
                    selected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                  }`}
                >
                  <input
                    id={`${id}-${level}`}
                    type="radio"
                    name={`${id}-level`}
                    value={level}
                    checked={selected}
                    onChange={() => chooseLevel(level)}
                    disabled={isPending}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <LevelIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t(`levels.${level}.label`)}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t(`levels.${level}.description`)}</span>
                  </span>
                </label>

                {level === "custom" && preference.level === "custom" && (
                  <div className="space-y-2 pl-9">
                    {LAIR_NOTIFICATION_CATEGORIES.map((category) => (
                      <label
                        key={category}
                        htmlFor={`${id}-${category}`}
                        className="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <Checkbox
                          id={`${id}-${category}`}
                          checked={preference.categories.includes(category)}
                          onCheckedChange={(checked) => toggleCategory(category, checked === true)}
                          disabled={isPending}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block">{t(`categories.${category}.label`)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t(`categories.${category}.description`)}
                          </span>
                        </span>
                      </label>
                    ))}
                    {preference.categories.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("emptyCustom")}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
