import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, Code2, Globe2, MessageSquareMore, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Joutes pour développeurs Riftbound | MCP, Discord et API",
  description: "Découvrez les outils de développement Joutes orientés Riftbound : serveur MCP, intégrations Discord, API et documentation pour construire autour du jeu.",
  alternates: { canonical: "/games/riftbound/developers" },
  openGraph: {
    url: "https://www.joutes.app/games/riftbound/developers",
    title: "Joutes pour développeurs Riftbound",
    description: "Explorez les fonctionnalités développeur Joutes pour Riftbound via MCP, Discord et API.",
    type: "website",
  },
};

const developerFeatures = [
  {
    title: "MCP pour agents IA",
    description: "Connectez vos assistants IA aux données de Riftbound pour rechercher des cartes, des règles, des erratas et des événements.",
    href: "/games/riftbound/developers/mcp",
    icon: Bot,
    badge: "IA",
  },
  {
    title: "Intégration Discord",
    description: "Automatisez les annonces d’événements, les tableaux synchronisés et la recherche de cartes depuis Discord.",
    href: "/games/riftbound/developers/discord",
    icon: MessageSquareMore,
    badge: "Discord",
  },
  {
    title: "API de données",
    description: "Accédez aux ressources Joutes de manière programmatique pour créer des outils, dashboards et workflows autour de Riftbound.",
    href: "/games/riftbound/developers/api",
    icon: KeyRound,
    badge: "API",
  },
];

export default function RiftboundDevelopersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/games/riftbound">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour au jeu
            </Button>
          </Link>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Développeurs Riftbound sur Joutes</h1>
            <p className="text-muted-foreground">
              Une collection de fonctionnalités et d’intégrations conçues pour les outils, bots, agents IA et applications autour de Riftbound.
            </p>
          </div>
        </div>

        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="h-5 w-5" />
              Pourquoi cette section existe
            </CardTitle>
            <CardDescription>
              Joutes expose des données structurées et des intégrations pratiques pour que les développeurs puissent construire des expériences autour du métagame Riftbound.
            </CardDescription>
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
                      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{feature.badge}</span>
                    </div>
                    <h2 className="text-lg font-semibold">{feature.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
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
              Fonctionnalités couvertes
            </CardTitle>
            <CardDescription>
              Chaque rubrique vous guide vers une expérience dédiée selon le type d’intégration que vous souhaitez mettre en place.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Le protocole MCP permet d’interroger les règles, les cartes et les événements depuis des agents IA compatibles.
            </p>
            <p>
              Le bot Discord apporte une expérience collaborative autour des événements et de la recherche de cartes.
            </p>
            <p>
              Les endpoints API et la documentation OpenAPI facilitent l’intégration dans des applications tierces ou des workflows automatisés.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
