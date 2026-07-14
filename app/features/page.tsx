import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Dices,
  Heart,
  Layers,
  Library,
  MapPin,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  CardsMockup,
  CollectionMockup,
  DecksMockup,
  GamesMockup,
  HeroMockup,
  LairsMockup,
  LeaguesMockup,
  PlayGroupsMockup,
  WishlistsMockup,
} from "./Mockups";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Features");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

const FEATURES = [
  { id: "games", icon: Dices, accent: "from-blue-500 to-cyan-500", Mockup: GamesMockup },
  { id: "cards", icon: BookOpen, accent: "from-violet-500 to-fuchsia-500", Mockup: CardsMockup },
  { id: "collection", icon: Library, accent: "from-emerald-500 to-teal-500", Mockup: CollectionMockup },
  { id: "playGroups", icon: Users, accent: "from-amber-500 to-orange-500", Mockup: PlayGroupsMockup },
  { id: "wishlists", icon: Heart, accent: "from-rose-500 to-pink-500", Mockup: WishlistsMockup },
  { id: "lairs", icon: MapPin, accent: "from-cyan-500 to-sky-500", Mockup: LairsMockup },
  { id: "decks", icon: Layers, accent: "from-indigo-500 to-blue-500", Mockup: DecksMockup },
  { id: "leagues", icon: Trophy, accent: "from-orange-500 to-red-500", Mockup: LeaguesMockup },
] as const;

export default async function FeaturesPage() {
  const t = await getTranslations("Features");

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
              <Sparkles className="size-3.5 text-primary" />
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
                <Link href="/games">{t("hero.ctaPrimary")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">{t("hero.ctaSecondary")}</Link>
              </Button>
            </div>
          </div>
          <div className="animate-fade-in animate-delay-200 mx-auto w-full max-w-sm md:max-w-none">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* Feature sections */}
      <section className="container mx-auto space-y-20 px-4 py-16 sm:px-6 sm:space-y-28 lg:px-8">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const Mockup = feature.Mockup;
          const reversed = index % 2 === 1;
          const bullets = t.raw(`items.${feature.id}.bullets`) as string[];
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
                </ul>
              </div>
              <div className="mx-auto w-full max-w-sm md:max-w-none">
                <Mockup />
              </div>
            </div>
          );
        })}
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
              <Link href="/games">{t("cta.ctaPrimary")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t("cta.ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
