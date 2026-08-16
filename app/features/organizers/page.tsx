import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Landmark,
  Medal,
  Megaphone,
  Plug,
  Store,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  CalendarMockup,
  EngagementMockup,
  HeroMockup,
  IntegrationsMockup,
  LeaguesMockup,
  RegistrationsMockup,
  TournamentsMockup,
} from "./Mockups";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("FeaturesOrganizers");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: [
      "organisateur d'événements",
      "boutique de jeu",
      "local game store",
      "association de jeu",
      "tournoi",
      "ligue",
      "inscriptions",
      "calendrier d'événements",
      "joutes",
    ],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

const AUDIENCE = [
  { id: "stores", icon: Store },
  { id: "associations", icon: Landmark },
  { id: "organizers", icon: UserRound },
  { id: "publishers", icon: Building2 },
] as const;

const FEATURES = [
  { id: "calendar", icon: CalendarDays, accent: "from-blue-500 to-cyan-500", Mockup: CalendarMockup },
  { id: "engagement", icon: Megaphone, accent: "from-violet-500 to-fuchsia-500", Mockup: EngagementMockup },
  { id: "registrations", icon: ClipboardList, accent: "from-emerald-500 to-teal-500", Mockup: RegistrationsMockup },
  { id: "tournaments", icon: Trophy, accent: "from-orange-500 to-red-500", Mockup: TournamentsMockup },
  { id: "leagues", icon: Medal, accent: "from-indigo-500 to-violet-500", Mockup: LeaguesMockup },
  { id: "integrations", icon: Plug, accent: "from-slate-500 to-slate-700", Mockup: IntegrationsMockup },
] as const;

const LINKS = [
  { id: "discord", href: "/integrations/discord" },
  { id: "api", href: "/integrations/api" },
  { id: "mcp", href: "/integrations/mcp" },
  { id: "players", href: "/features" },
] as const;

export default async function OrganizersFeaturesPage() {
  const t = await getTranslations("FeaturesOrganizers");

  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-10rem] size-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/20 to-purple-600/20 blur-3xl" />
        </div>
        <div className="container mx-auto grid gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center md:py-24 lg:px-8">
          <div className="animate-fade-in space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Store className="size-3.5 text-primary" />
              {t("hero.eyebrow")}
            </span>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                {t("hero.titleHighlight")}
              </span>{" "}
              {t("hero.title")}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("hero.subtitle")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/events/new">{t("hero.ctaPrimary")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tournaments/new">{t("hero.ctaSecondary")}</Link>
              </Button>
            </div>
          </div>
          <div className="animate-fade-in animate-delay-200 mx-auto w-full max-w-sm md:max-w-none">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* À qui s'adresse la plateforme */}
      <section className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("audience.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("audience.subtitle")}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map((entry) => {
            const Icon = entry.icon;
            return (
              <div
                key={entry.id}
                className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{t(`audience.items.${entry.id}.title`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(`audience.items.${entry.id}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Fonctionnalités */}
      <section className="container mx-auto space-y-20 px-4 py-16 sm:space-y-28 sm:px-6 lg:px-8">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const Mockup = feature.Mockup;
          const reversed = index % 2 === 1;
          const bullets = t.raw(`items.${feature.id}.bullets`) as string[];
          // Les fonctionnalités annoncées mais pas encore livrées vivent dans une
          // clé à part et portent un badge : une page de vente ne doit pas les
          // faire passer pour existantes.
          const soon = t.has(`items.${feature.id}.soon`)
            ? (t.raw(`items.${feature.id}.soon`) as string[])
            : [];
          return (
            <div
              key={feature.id}
              className={`grid items-center gap-10 md:grid-cols-2 ${reversed ? "md:[&>*:first-child]:order-2" : ""}`}
            >
              <div className="space-y-4">
                <div
                  className={`inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.accent} text-white shadow-lg`}
                >
                  <Icon className="size-5" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {t(`items.${feature.id}.title`)}
                </h2>
                <p className="text-muted-foreground">{t(`items.${feature.id}.description`)}</p>
                <ul className="space-y-2 pt-2">
                  {bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full bg-gradient-to-br ${feature.accent}`}
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                  {soon.map((bullet) => (
                    <li key={bullet} className="flex flex-wrap items-start gap-2.5 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full border border-muted-foreground/60" />
                      <span>{bullet}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {t("soonLabel")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mx-auto w-full max-w-sm md:max-w-none">
                <Mockup />
              </div>
            </div>
          );
        })}
      </section>

      {/* Documentation */}
      <section className="container mx-auto px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("links.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("links.subtitle")}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LINKS.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className="rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <h3 className="font-semibold">{t(`links.${link.id}.title`)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(`links.${link.id}.description`)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-purple-600/10 px-6 py-16 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/10 to-purple-600/10 blur-3xl" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("cta.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("cta.subtitle")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/events/new">{t("cta.ctaPrimary")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="https://discord.gg/dZEGkZwJGB" target="_blank" rel="noopener noreferrer">
                {t("cta.ctaSecondary")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
