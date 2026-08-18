"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

/** Le paramètre que la redirection de better-auth ramène après une liaison. */
export const LINKED_PARAM = "linked";

/**
 * Synchronise une fois, au retour de la liaison Patreon.
 *
 * better-auth écrit la ligne `account` et redirige ; il ne sait rien des paliers
 * de la campagne. Sans cet appel, un compte fraîchement lié restait sans
 * projection : aucun palier, et un écran qui continuait de proposer de lier.
 *
 * L'écriture passe par l'action serveur plutôt que par le rendu de la page — une
 * page qui écrit en base pendant son rendu se rejouerait à chaque rafraîchissement.
 * Le paramètre est retiré de l'URL aussitôt, pour qu'un rechargement ne
 * resynchronise pas indéfiniment.
 */
export function SyncAfterLink() {
  const t = useTranslations("AccountSubscription");
  const router = useRouter();
  const searchParams = useSearchParams();
  const done = useRef(false);

  const justLinked = searchParams.get(LINKED_PARAM) === "patreon";

  useEffect(() => {
    if (!justLinked || done.current) {
      return;
    }
    done.current = true;

    void (async () => {
      try {
        const result = await resyncMySubscriptionAction();

        if (result.success) {
          toast.success(t("resyncDone"));
        } else {
          // Pas de message d'erreur : un compte lié sans adhésion à la campagne
          // est un cas parfaitement normal — le porteur de la campagne, ou
          // quelqu'un qui n'a pas encore choisi de palier —, et la page
          // l'explique déjà en toutes lettres. Une alerte rouge ferait chercher
          // une panne inexistante. La raison va en console pour le diagnostic.
          console.info("Synchronisation Patreon sans effet:", result.error);
        }
      } catch (error) {
        console.error("Échec de la synchronisation après liaison:", error);
        toast.error(t("resyncFailed"));
      } finally {
        // Dans le `finally` : sans cela, une exception laisserait `?linked` dans
        // l'URL, et chaque rechargement relancerait la synchronisation.
        router.replace("/account/subscription");
      }
    })();
  }, [justLinked, router, t]);

  return null;
}

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
            // Le marqueur que `SyncAfterLink` attend : better-auth n'écrit que
            // la ligne `account`, personne n'irait lire l'abonnement chez
            // Patreon sans lui.
            callbackURL: `/account/subscription?${LINKED_PARAM}=patreon`,
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
