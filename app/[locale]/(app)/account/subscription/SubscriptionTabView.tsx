import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Heart, MapPin } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { PlanBadge } from "@/components/PlanBadge.tsx";
import { getLairsByIds } from "@/lib/db/lairs.ts";
import { patreonConfig, patreonPublicUrl } from "@/lib/patreon/config.ts";
import { getMySubscriptionSummary } from "@/lib/subscriptions/access.ts";
import { displayPlan } from "@/lib/subscriptions/entitlements.ts";

import { LinkPatreonButton, ResyncButton, SyncAfterLink, UnlinkPatreonButton } from "./components.tsx";

/**
 * L'onglet « Abonnement ».
 *
 * Le contenu de l'ancienne page `/account/subscription`, déplacé sans changer
 * ce qu'il montre ni ce qu'il permet. Il garde son propre espace de noms de
 * traduction, `AccountSubscription`, qui était déjà le seul écran traduit de
 * tout l'espace personnel.
 */
export default async function SubscriptionTabView() {
  const [t, summary] = await Promise.all([
    getTranslations("AccountSubscription"),
    getMySubscriptionSummary(),
  ]);

  const configured = Boolean(patreonConfig());
  const patreonUrl = patreonPublicUrl();

  const plan = displayPlan(summary?.plans ?? []);
  const seats = summary?.seats ?? [];
  // Les lieux parrainés sont nommés plutôt que listés par identifiant : c'est la
  // seule information que l'abonné reconnaît.
  const lairs = seats.length > 0 ? await getLairsByIds(seats.map((seat) => seat.lairId)) : [];

  return (
    <div className="space-y-6">
      {/* `useSearchParams` impose une frontière de suspense : le composant ne
          rend rien, la frontière n'a donc pas de repli à montrer. */}
      <Suspense fallback={null}>
        <SyncAfterLink />
      </Suspense>

      <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Heart className="h-5 w-5 text-primary" aria-hidden />
            {plan ? t("activeTitle") : t("noneTitle")}
            {/* Inerte : ce badge décrit l'abonnement de la page elle-même, s'y
                renvoyer n'apprendrait rien. Le lien vers les offres est en bas
                de page. */}
            <PlanBadge plan={plan} interactive={false} />
          </CardTitle>
          <CardDescription>{plan ? t("activeSubtitle") : t("noneSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary?.syncedAt && (
            <p className="text-sm text-muted-foreground">
              {t("syncedAt", { date: summary.syncedAt.toLocaleString("fr-FR") })}
            </p>
          )}

          {!configured && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {t("notConfigured")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {summary?.linkedToProvider ? (
              <>
                <ResyncButton />
                <UnlinkPatreonButton />
              </>
            ) : (
              <LinkPatreonButton configured={configured} />
            )}
            {patreonUrl && !plan && (
              <Button variant="outline" asChild>
                <Link href={patreonUrl} target="_blank" rel="noopener noreferrer">
                  {t("discover")}
                </Link>
              </Button>
            )}
          </div>

          {!summary?.linkedToProvider && (
            <p className="text-sm text-muted-foreground">{t("linkHint")}</p>
          )}

          {/* Lié, mais aucune adhésion rattachée : le porteur de la campagne,
              ou quelqu'un qui n'a pas encore choisi de palier. Le dire évite de
              chercher une panne là où il n'y en a pas. */}
          {summary?.linkedToProvider && !summary.hasProviderMembership && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {t("linkedNotSynced")}
            </p>
          )}
        </CardContent>
      </Card>

      {summary && summary.seatsTotal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <MapPin className="h-5 w-5" aria-hidden />
              {t("seatsTitle")}
              <Badge variant="outline">
                {t("seatsCount", { used: seats.length, total: summary.seatsTotal })}
              </Badge>
            </CardTitle>
            <CardDescription>{t("seatsSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("seatsEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {lairs.map((lair) => (
                  <li
                    key={lair.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <Link href={`/lairs/${lair.id}`} className="font-medium hover:underline">
                      {lair.name}
                    </Link>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/lairs/${lair.id}/manage`}>{t("manageLair")}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted-foreground">{t("seatsHint")}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/pricing" className="hover:underline">
          {t("seePlans")}
        </Link>
      </p>
    </div>
  );
}
