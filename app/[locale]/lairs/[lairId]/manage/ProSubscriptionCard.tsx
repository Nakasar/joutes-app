"use client";

import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { attachProToLair, detachProFromLair } from "./actions";

/**
 * Le rattachement d'un lieu à un abonnement Pro.
 *
 * L'état affiché n'est jamais stocké sur le lieu : il se dérive de l'abonnement
 * qui détient son siège. Quand cet abonnement s'éteint, ce bloc bascule tout
 * seul de « actif » à « parrain sans abonnement » — et c'est important qu'il le
 * *dise*, parce qu'un propriétaire qui voit des options disparaître sans
 * explication ouvre un ticket.
 */
export default function ProSubscriptionCard({
  lairId,
  isPro,
  attachedByMe,
  canAttach,
  refusal,
}: {
  lairId: string;
  isPro: boolean;
  attachedByMe: boolean;
  canAttach: boolean;
  refusal: string | null;
}) {
  const t = useTranslations("Lairs.manage.pro");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isPro ? "default" : "outline"}>
          {isPro ? t("statusActive") : t("statusInactive")}
        </Badge>
        {attachedByMe && <Badge variant="outline">{t("statusMine")}</Badge>}
      </div>

      <p className="text-sm text-muted-foreground">
        {isPro ? t("activeDescription") : t("inactiveDescription")}
      </p>

      {/* Le siège est là mais l'abonnement ne porte plus rien : le dire
          explicitement plutôt que de laisser deviner. */}
      {!isPro && attachedByMe && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("lapsed")}
        </p>
      )}

      {!isPro && !canAttach && refusal && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t(`refusal.${refusal}`)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {isPro || attachedByMe ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await detachProFromLair(lairId);
                if (result.success) {
                  toast.success(t("detached"));
                } else {
                  toast.error(t("detachFailed"));
                }
              })
            }
          >
            {t("detach")}
          </Button>
        ) : (
          <Button
            disabled={pending || !canAttach}
            onClick={() =>
              startTransition(async () => {
                const result = await attachProToLair(lairId);
                if (result.success) {
                  toast.success(t("attached"));
                  return;
                }
                // Les motifs de refus ont chacun leur message ; tout autre
                // erreur retombe sur le message générique plutôt que d'afficher
                // une clé de traduction manquante.
                const key = `refusal.${result.error}`;
                toast.error(t.has(key) ? t(key) : t("attachFailed"));
              })
            }
          >
            {t("attach")}
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link href="/account/subscription">{t("mySubscription")}</Link>
        </Button>
      </div>
    </div>
  );
}
