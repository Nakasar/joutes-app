"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";
import type { LairSection, LairSectionKey } from "@/lib/lairs/sections.ts";

/**
 * L'ordre et l'activation des sections de la vitrine.
 *
 * Le glisser-déposer est natif — `draggable` et les événements HTML5, sans
 * dépendance — mais il ne suffit pas : une souris n'est pas le seul moyen de
 * réordonner une liste. Chaque ligne porte donc aussi deux boutons monter /
 * descendre, atteignables au clavier, qui font le même travail.
 */
export default function LairSectionsField({
  sections,
  onChange,
  disabled,
}: {
  sections: LairSection[];
  onChange: (sections: LairSection[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Lairs.manage.customization.sections");
  const [dragged, setDragged] = useState<LairSectionKey | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) {
      return;
    }

    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <ul className="flex flex-col gap-2">
      {sections.map((section, index) => (
        <li
          key={section.key}
          draggable={!disabled}
          onDragStart={() => setDragged(section.key)}
          onDragEnd={() => setDragged(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!dragged || dragged === section.key) {
              return;
            }
            move(
              sections.findIndex((item) => item.key === dragged),
              index,
            );
            setDragged(null);
          }}
          className={cn(
            "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5",
            dragged === section.key && "opacity-50",
            disabled && "opacity-60",
          )}
        >
          <GripVertical
            className={cn("size-4 shrink-0 text-muted-foreground", !disabled && "cursor-grab")}
            aria-hidden
          />

          <span className="min-w-0 flex-1 text-sm">{t(`labels.${section.key}`)}</span>

          {/* Le verrou porte sur l'activation, pas sur la position : le
              calendrier garde ses flèches, seul son interrupteur disparaît. */}
          {section.locked && (
            <span className="font-mono text-[11px] text-muted-foreground">{t("alwaysShown")}</span>
          )}

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => move(index, index - 1)}
              aria-label={t("moveUp", { section: t(`labels.${section.key}`) })}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={disabled || index === sections.length - 1}
              onClick={() => move(index, index + 1)}
              aria-label={t("moveDown", { section: t(`labels.${section.key}`) })}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>

          {!section.locked && (
            <Switch
              checked={section.enabled}
              disabled={disabled}
              aria-label={t(`labels.${section.key}`)}
              onCheckedChange={(enabled) =>
                onChange(
                  sections.map((item) =>
                    item.key === section.key ? { ...item, enabled } : item,
                  ),
                )
              }
              className="data-[state=checked]:bg-[var(--lair-accent,var(--primary))]"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
