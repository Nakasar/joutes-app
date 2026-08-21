"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils.ts";
import type { PlayGroupVisibility } from "@/lib/types/PlayGroup";

import { updatePlayGroupVisibility } from "../actions.ts";

/**
 * Qui peut trouver le groupe.
 *
 * Son propre bloc, séparé de la personnalisation : ce n'est pas une question
 * d'apparence mais de gouvernance, et le mélanger aux couleurs le ferait
 * changer par inadvertance en enregistrant un logo.
 *
 * Les deux choix sont montrés côte à côte avec leur conséquence écrite en
 * toutes lettres, plutôt qu'un interrupteur « privé » dont personne ne sait ce
 * qu'il cache exactement.
 */
export default function PlayGroupVisibilityForm({
  playGroupId,
  visibility,
}: {
  playGroupId: string;
  visibility: PlayGroupVisibility;
}) {
  const t = useTranslations("PlayGroups.hub.settings.visibility");
  const [current, setCurrent] = useState<PlayGroupVisibility>(visibility);
  const [pending, startTransition] = useTransition();

  const choose = (next: PlayGroupVisibility) => {
    if (next === current || pending) {
      return;
    }

    const previous = current;
    setCurrent(next);

    startTransition(async () => {
      const result = await updatePlayGroupVisibility(playGroupId, { visibility: next });

      if (result.success) {
        toast.success(t(next === "private" ? "savedPrivate" : "savedPublic"));
        return;
      }

      setCurrent(previous);
      toast.error(t("error"));
    });
  };

  const options = [
    { key: "public" as const, Icon: Eye },
    { key: "private" as const, Icon: EyeOff },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            // `aria-pressed` plutôt que `role="radio"` : une radio ARIA promet
            // un groupe et une navigation aux flèches, que ces deux boutons
            // n'offrent pas. Un bouton bascule dit ce qu'il est vraiment, et
            // c'est déjà le motif employé ailleurs dans les groupes.
            aria-pressed={current === key}
            disabled={pending}
            onClick={() => choose(key)}
            className={cn(
              "flex flex-col gap-1.5 rounded-[10px] border p-4 text-left transition-colors disabled:opacity-70",
              current === key
                ? "border-[var(--group-accent-40)] bg-[var(--group-accent-10)]"
                : "hover:bg-accent",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon
                className={cn("size-4 shrink-0", current === key ? "text-[var(--group-accent-text)]" : "text-muted-foreground")}
                aria-hidden
              />
              {t(`${key}.label`)}
            </span>
            <span className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{t(`${key}.detail`)}</span>
          </button>
        ))}
      </div>

      {current === "private" && <p className="font-mono text-[11px] text-muted-foreground">{t("privateNotice")}</p>}
    </section>
  );
}
