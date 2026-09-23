
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Bell,
  Gamepad2,
  LinkIcon,
  Search,
  Ticket,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { setRequestLocale } from "next-intl/server";
import DiscordEventBoard from './discord-event-board.png';
import Image from "next/image";
import type {Metadata} from "next";


export const metadata: Metadata = {
  title: "Documentation Discord",
  description: "Intégrer Joutes avec Discord : gestion de réservation, publications, notifications en message privé, informations des jeux et règles...",
  keywords: ["discord", "bot discord", "intégration discord", "évènements", "notifications discord", "jeux de cartes à collectionner"],
  openGraph: {
    title: "Documentation Discord - Joutes",
    description: "Intégrer Joutes avec Discord : gestion de réservation, publications, notifications en message privé, informations des jeux et règles...",
  },
};

export default async function IntegrationsDiscordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Fixe la langue pour cette page : sans cet appel, le `Link` localisé la lit
  // à la requête et fait basculer toute la route en rendu dynamique.
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          {/* Header avec retour */}
          <div className="flex items-center gap-4">
            <Link href="/integrations">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
            </Link>
            <div className="flex-1 space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Joutes Discord Bot</h1>
              <p className="text-muted-foreground">
                Le bot Discord de Joutes vous aide à consulter les informations clés des évènements, publier un tableau mis à jour automatiquement, rechercher des cartes directement depuis votre serveur et recevoir vos notifications Joutes en message privé.
              </p>
            </div>
          </div>

          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Discord</Badge>
                <Badge variant="outline">Évènements</Badge>
                <Badge variant="outline">Jeux</Badge>
                <Badge variant="outline">Notifications</Badge>
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl">Les commandes utiles du bot en un coup d&apos;œil</CardTitle>
                <CardDescription className="max-w-3xl text-sm sm:text-base">
                  Utilisez le bot pour partager rapidement les détails d&apos;un évènement, garder un tableau Discord synchronisé avec Joutes et retrouver les informations d&apos;une carte sans quitter votre salon.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Fonctionnalités liées aux évènements
              </CardTitle>
              <CardDescription>
                Centralisez la consultation et le suivi des évènements Joutes directement dans Discord.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Ticket className="h-4 w-4" />
                    Commande d&apos;information
                  </div>
                  <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono break-words">
                    /events info &lt;id ou URL&gt;
                  </code>
                  <p className="text-sm text-muted-foreground">
                    Affiche les informations essentielles d&apos;un évènement : prix, date, participants, description, lien et autres détails utiles.
                  </p>
                </div>

                <div className="rounded-xl border bg-background p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Tableau synchronisé
                  </div>
                  <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono break-words">
                    /events board &lt;id ou URL&gt;
                  </code>
                  <p className="text-sm text-muted-foreground">
                    Crée un tableau Discord avec les informations de l&apos;évènement, mis à jour automatiquement pour suivre son état dans le temps.
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    Un seul tableau peut exister par évènement.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Inscription directe depuis Discord
                </div>
                <p className="text-sm text-muted-foreground">
                  Depuis le tableau ou la fiche d&apos;informations d&apos;un évènement, les utilisateurs Discord ayant lié leur compte Joutes à Discord peuvent s&apos;inscrire en cliquant sur le bouton <span className="font-medium text-foreground">S&apos;inscrire</span>.
                </p>
              </div>

              <Image className="text-center mx-auto" src={DiscordEventBoard} alt={"Affichage du tableau d'évènement sur Discord"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5" />
                Fonctionnalité liée aux jeux
              </CardTitle>
              <CardDescription>
                Retrouvez rapidement une carte et ses informations directement dans Discord.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-background p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Search className="h-4 w-4" />
                  Recherche de carte
                </div>
                <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono break-words">
                  /carte &lt;nom&gt; &lt;jeu&gt;
                </code>
                <p className="text-sm text-muted-foreground">
                  Exemple : <span className="font-mono text-foreground">/carte Stalking Wolf Riftbound</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Le bot affiche l&apos;image de la carte, ses détails, ainsi que ses erratas et rulings pour le jeu sélectionné.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications en message privé
              </CardTitle>
              <CardDescription>
                Recevez toutes vos notifications Joutes en message privé du bot, en plus du site, de l&apos;application et des notifications push.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    Activer
                  </div>
                  <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono break-words">
                    /notifications activer
                  </code>
                  <p className="text-sm text-muted-foreground">
                    Le bot vous envoie un premier message pour vérifier qu&apos;il peut vous écrire, puis chaque notification Joutes vous arrive aussi en message privé : résultat à confirmer, table attribuée, place libérée sur une liste d&apos;attente, annonces…
                  </p>
                </div>

                <div className="rounded-xl border bg-background p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    Couper
                  </div>
                  <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono break-words">
                    /notifications désactiver
                  </code>
                  <p className="text-sm text-muted-foreground">
                    Vous ne recevez plus rien en message privé ; vos notifications restent sur le site et dans l&apos;application. Le même réglage existe dans l&apos;onglet Notifications de votre compte.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Pour que le bot puisse vous écrire
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Votre compte Discord est lié à votre compte Joutes.</li>
                  <li>Vous partagez au moins un serveur avec le bot Joutes.</li>
                  <li>Les messages privés des membres de ce serveur sont autorisés dans vos paramètres Discord.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Si le bot ne peut plus vous écrire, le réglage se coupe de lui-même : réactivez-le une fois la situation réglée.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Lier votre compte Discord
              </CardTitle>
              <CardDescription>
                La liaison de compte est nécessaire pour utiliser l&apos;inscription depuis Discord et recevoir vos notifications en message privé.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground max-w-2xl">
                Pour lier votre compte Discord à Joutes, rendez-vous dans les paramètres de sécurité de votre compte.
              </p>
              <Button asChild>
                <Link href="/account/security">
                  Ouvrir la page de sécurité
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}