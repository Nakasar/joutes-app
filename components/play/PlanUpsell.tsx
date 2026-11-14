"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Ce qu'une page Jouer montre à la place d'une fonctionnalité réservée à un
 * abonnement : ce qu'elle apporte, l'offre qui l'ouvre et le lien vers la page
 * d'offres. Le refus lui-même vient du serveur (code `SUBSCRIPTION`) ; ce
 * panneau évite seulement de proposer un bouton qui échouerait.
 *
 * - `host` : créer une partie en ligne en tant qu'hôte (Joutes Pro ou Expert) ;
 * - `simulate` : simuler un deck (Joutes Expert).
 */
export function PlanUpsell({
  feature,
  compact = false,
  className,
}: {
  feature: "host" | "simulate";
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("Games.Play.upsell");
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-violet-500/40 bg-violet-500/5 p-4 text-sm",
        compact && "p-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4 shrink-0 text-violet-500" aria-hidden />
        {t(`${feature}.title`)}
      </p>
      {!compact && <p className="text-muted-foreground">{t(`${feature}.body`)}</p>}
      <Button asChild size="sm" className="self-start">
        <Link href="/pricing">{t(`${feature}.cta`)}</Link>
      </Button>
    </div>
  );
}
