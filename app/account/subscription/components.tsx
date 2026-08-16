"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { RefreshCw, Unlink } from "lucide-react";
import { resyncMySubscriptionAction, unlinkPatreonAction } from "./actions";

/**
 * Les commandes de l'écran « mon abonnement ».
 *
 * Le strict minimum côté client : tout le reste de la page est rendu sur le
 * serveur. Seules ces trois actions ont besoin du navigateur — la liaison parce
 * qu'elle redirige vers Patreon, les deux autres parce qu'elles montrent un état
 * d'attente.
 */

export function LinkPatreonButton({ configured }: { configured: boolean }) {
  const t = useTranslations("AccountSubscription");
  const [pending, setPending] = useState(false);

  if (!configured) {
    // Aperçu ou environnement sans secrets : le bouton existe mais explique
    // pourquoi il ne mène nulle part, au lieu d'échouer une fois cliqué.
    return (
      <Button disabled title={t("notConfiguredHint")}>
        {t("link")}
      </Button>
    );
  }

  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.oauth2.link({
            providerId: "patreon",
            callbackURL: "/account/subscription",
          });
        } catch {
          setPending(false);
          toast.error(t("linkFailed"));
        }
      }}
    >
      {t("link")}
    </Button>
  );
}

export function ResyncButton() {
  const t = useTranslations("AccountSubscription");
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resyncMySubscriptionAction();
          if (result.success) {
            toast.success(t("resyncDone"));
          } else {
            toast.error(t("resyncFailed"));
          }
        })
      }
    >
      <RefreshCw className="mr-2 h-4 w-4" />
      {t("resync")}
    </Button>
  );
}

export function UnlinkPatreonButton() {
  const t = useTranslations("AccountSubscription");
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await unlinkPatreonAction();
          if (result.success) {
            toast.success(t("unlinkDone"));
          } else {
            toast.error(t("unlinkFailed"));
          }
        })
      }
    >
      <Unlink className="mr-2 h-4 w-4" />
      {t("unlink")}
    </Button>
  );
}
