import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Heart, MapPin } from "lucide-react";
import { PlanBadge } from "@/components/PlanBadge";
import { getLairsByIds } from "@/lib/db/lairs";
import { patreonConfig, patreonPublicUrl } from "@/lib/patreon/config";
import { getMySubscriptionSummary } from "@/lib/subscriptions/access";
import { displayPlan } from "@/lib/subscriptions/entitlements";
import { LinkPatreonButton, ResyncButton, SyncAfterLink, UnlinkPatreonButton } from "./components";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Mon abonnement",
  robots: { index: false, follow: false },
};

export default async function SubscriptionPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const t = await getTranslations("AccountSubscription");
  const summary = await getMySubscriptionSummary();
  const configured = Boolean(patreonConfig());
  const patreonUrl = patreonPublicUrl();

  const plan = displayPlan(summary?.plans ?? []);
  const seats = summary?.seats ?? [];
  // Les lieux parrainés sont nommés plutôt que listés par identifiant : c'est la
  // seule information que l'abonné reconnaît.
  const lairs = seats.length > 0 ? await getLairsByIds(seats.map((seat) => seat.lairId)) : [];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* `useSearchParams` impose une frontière de suspense : le composant ne
          rend rien, la frontière n'a donc pas de repli à montrer. */}
      <Suspense fallback={null}>
        <SyncAfterLink />
      </Suspense>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/account">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("back")}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        </div>

        {/* État de l'abonnement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              {plan ? t("activeTitle") : t("noneTitle")}
              {/* Inerte : ce badge décrit l'abonnement de la page elle-même, s'y
                  renvoyer n'apprendrait rien. Le lien vers les offres est en
                  bas de page. */}
              <PlanBadge plan={plan} interactive={false} />
            </CardTitle>
            <CardDescription>
              {plan ? t("activeSubtitle") : t("noneSubtitle")}
            </CardDescription>
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

            {/* Lié, mais aucune adhésion rattachée : le porteur de la
                campagne, ou quelqu'un qui n'a pas encore choisi de palier. Le
                dire évite de chercher une panne là où il n'y en a pas. */}
            {summary?.linkedToProvider && !summary.hasProviderMembership && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {t("linkedNotSynced")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lieux parrainés */}
        {summary && summary.seatsTotal > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <MapPin className="h-5 w-5" />
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
    </div>
  );
}
