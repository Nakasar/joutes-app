
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Gamepad2,
  LinkIcon,
  Search,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import DiscordEventBoard from './discord-event-board.png';
import Image from "next/image";
import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Documentation Discord",
  description: "Intégrer Joutes avec Discord : gestion de réservation, publications, informations des jeux et règles...",
  keywords: ["discord", "bot discord", "intégration discord", "évènements", "jeux de cartes à collectionner"],
};

export default function IntegrationsDiscordPage() {
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
                Le bot Discord de Joutes vous aide à consulter les informations clés des évènements, publier un tableau mis à jour automatiquement et rechercher des cartes directement depuis votre serveur.
              </p>
            </div>
          </div>

          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Discord</Badge>
                <Badge variant="outline">Évènements</Badge>
                <Badge variant="outline">Jeux</Badge>
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
                <LinkIcon className="h-5 w-5" />
                Lier votre compte Discord
              </CardTitle>
              <CardDescription>
                La liaison de compte est nécessaire pour utiliser l&apos;inscription depuis Discord.
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