import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, Code2, Globe2, MessageSquareMore, KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Games.Developers");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["riftbound", "développeurs", "api", "mcp", "discord", "intégration"],
    alternates: { canonical: "/games/riftbound/developers" },
    openGraph: {
      url: "https://www.joutes.app/games/riftbound/developers",
      title: t("metadata.ogTitle"),
      description: t("metadata.ogDescription"),
      type: "website",
    },
  };
}

export default async function RiftboundDevelopersPage() {
  const t = await getTranslations("Games.Developers");

  const developerFeatures = [
    {
      key: "mcp",
      href: "/games/riftbound/developers/mcp",
      icon: Bot,
    },
    {
      key: "discord",
      href: "/games/riftbound/developers/discord",
      icon: MessageSquareMore,
    },
    {
      key: "api",
      href: "/games/riftbound/developers/api",
      icon: KeyRound,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/games/riftbound">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("back")}
            </Button>
          </Link>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("intro")}</p>
          </div>
        </div>

        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="h-5 w-5" />
              {t("why.title")}
            </CardTitle>
            <CardDescription>{t("why.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {developerFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link key={feature.href} href={feature.href} className="group">
                  <div className="h-full rounded-xl border bg-background/70 p-5 transition hover:border-primary/50 hover:shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="rounded-full bg-primary/10 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
                        {t(`features.${feature.key}.badge`)}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold">{t(`features.${feature.key}.title`)}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t(`features.${feature.key}.description`)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              {t("covered.title")}
            </CardTitle>
            <CardDescription>{t("covered.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("covered.mcp")}</p>
            <p>{t("covered.discord")}</p>
            <p>{t("covered.api")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
