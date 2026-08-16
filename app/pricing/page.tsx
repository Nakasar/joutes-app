import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Heart, Sparkles, Store } from "lucide-react";
import { SUBSCRIPTION_PLAN_OPTIONS } from "@/lib/constants/subscription-plans";
import { appearanceForTone } from "@/lib/subscriptions/tone";
import { patreonPublicUrl } from "@/lib/patreon/config";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pricing");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["abonnement", "soutenir", "patreon", "supporter", "joutes expert", "joutes pro"],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

const AUDIENCE_ICONS = {
  supporter: Heart,
  player: Sparkles,
  organizer: Store,
} as const;

/** Le prix, écrit dans la langue de la page plutôt qu'à la main. */
function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    // Un prix rond s'écrit « 5 € » et non « 5,00 € » : la décimale ne dit rien
    // ici, elle alourdit seulement la lecture.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default async function PricingPage() {
  const t = await getTranslations("Pricing");
  const locale = await getLocale();
  const patreonUrl = patreonPublicUrl();

  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-10rem] size-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/20 to-purple-600/20 blur-3xl" />
        </div>
        <div className="container mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 md:py-24 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Heart className="size-3.5 text-primary" />
            {t("hero.eyebrow")}
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("hero.titleHighlight")}
            </span>{" "}
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{t("hero.subtitle")}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("hero.finePrint")}</p>
        </div>
      </section>

      {/* Les offres */}
      <section className="container mx-auto px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {SUBSCRIPTION_PLAN_OPTIONS.map((plan) => {
            const appearance = appearanceForTone(plan.tone);
            const Icon = AUDIENCE_ICONS[plan.audience];
            const features = t.raw(`plans.${plan.value}.features`) as string[];
            // Les fonctionnalités annoncées mais pas encore livrées vivent dans
            // une clé à part et portent un badge : une page de vente ne doit pas
            // les faire passer pour existantes.
            const soon = t.raw(`plans.${plan.value}.soon`) as string[];

            return (
              <div
                key={plan.value}
                className="relative flex flex-col overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", appearance.gradient)} />

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow",
                      appearance.gradient
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <Badge variant="outline" className={appearance.badge}>
                    {t(`audiences.${plan.audience}`)}
                  </Badge>
                </div>

                <h2 className="mt-4 text-2xl font-bold tracking-tight">{plan.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`plans.${plan.value}.tagline`)}
                </p>

                <p className="mt-4 flex flex-wrap items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">
                    {formatPrice(plan.monthlyCents, locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
                </p>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {soon.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-muted-foreground">
                      <Clock className="mt-0.5 size-4 shrink-0" />
                      {/* Le badge vit *dans* le paragraphe et non à côté : en
                          élément de rangée flex, il tombait à la ligne dès que
                          le libellé dépassait, et la liste devenait illisible.
                          Ici il suit le dernier mot, comme une incise. */}
                      <span>
                        {feature}{" "}
                        <Badge variant="outline" className="align-middle text-[10px] font-normal">
                          {t("soonLabel")}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {patreonUrl ? (
                    <Button asChild className="w-full">
                      <Link href={patreonUrl} target="_blank" rel="noopener noreferrer">
                        {t("cta.subscribe")}
                      </Link>
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      {t("cta.unavailable")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Contact */}
      <section className="container mx-auto px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-purple-600/10 px-6 py-14 text-center sm:px-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("footer.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("footer.subtitle")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="outline">
              <Link href="https://discord.gg/dZEGkZwJGB" target="_blank" rel="noopener noreferrer">
                {t("footer.cta")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
