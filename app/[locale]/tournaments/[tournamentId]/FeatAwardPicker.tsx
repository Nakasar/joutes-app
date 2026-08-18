"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TournamentFeat = {
  id: string;
  title: string;
  description?: string;
  points: number;
  maxPerEvent?: number;
  maxPerLeague?: number;
};

/**
 * Sélecteur de haut fait, partagé par la fiche d'un joueur et par la saisie
 * d'un match. Le catalogue vient de la ligue rattachée ; le bouton n'existe
 * donc pas sur un tournoi autonome, et l'appelant n'a rien à en savoir : il
 * suffit de ne pas lui passer de hauts faits.
 *
 * Les limites sont indiquées mais **jamais bloquantes** : c'est le calcul de
 * la clôture qui tranche, avec l'état réel de la ligue sous les yeux. Griser
 * ici sur une information qui peut avoir changé mentirait à l'arbitre.
 */
export function FeatAwardPicker({
  feats,
  awardedCounts,
  disabled,
  label,
  onAward,
}: {
  feats: TournamentFeat[];
  /** Nombre de fois que ce joueur a déjà reçu chaque haut fait dans le tournoi. */
  awardedCounts: Record<string, number>;
  disabled?: boolean;
  label?: string;
  onAward: (featId: string) => void | Promise<void>;
}) {
  const t = useTranslations("Tournaments");
  const [open, setOpen] = useState(false);

  if (feats.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Trophy className="size-3.5" />
          {label ?? t("feats.award")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <p className="mb-2 px-1 text-sm font-medium">{t("feats.award")}</p>
        <div className="flex flex-col gap-1">
          {feats.map((feat) => {
            const awarded = awardedCounts[feat.id] ?? 0;
            // `awarded` ne compte que ce tournoi ; `maxPerLeague` porte sur
            // toute la ligue. Les deux ne se comparent donc pas : on affiche
            // l'un et l'autre sans les mettre en fraction, et sans teinte
            // d'alerte qui prétendrait savoir où en est le quota.
            const leagueCap = feat.maxPerLeague;
            return (
              <Button
                key={feat.id}
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start py-1.5 text-left"
                onClick={async () => {
                  setOpen(false);
                  await onAward(feat.id);
                }}
              >
                <Trophy
                  className={cn(
                    "size-4 shrink-0",
                    awarded > 0 ? "text-amber-500" : "text-muted-foreground"
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{feat.title}</span>
                  {(awarded > 0 || leagueCap !== undefined) && (
                    <span className="text-xs text-muted-foreground">
                      {[
                        awarded > 0 ? t("feats.awardedCount", { count: awarded }) : null,
                        leagueCap !== undefined ? t("feats.leagueCap", { max: leagueCap }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                  {t("feats.points", { points: feat.points })}
                </span>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
