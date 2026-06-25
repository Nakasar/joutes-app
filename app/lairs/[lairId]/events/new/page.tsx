import { getLairById } from "@/lib/db/lairs";
import { getGameById } from "@/lib/db/games";
import { auth } from "@/lib/auth";
import { checkAdminOrOwner } from "@/lib/middleware/admin";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import EventForm from "./EventForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ lairId: string }> 
}): Promise<Metadata> {
  const { lairId } = await params;
  const t = await getTranslations("Lairs");
  const lair = await getLairById(lairId);

  if (!lair) {
    return {
      title: t("eventNew.notFound"),
    };
  }

  return {
    title: t("eventNew.metadata.title", { name: lair.name }),
    description: t("eventNew.metadata.description", { name: lair.name }),
  };
}

export default async function NewEventPage({ 
  params 
}: { 
  params: Promise<{ lairId: string }> 
}) {
  const t = await getTranslations("Lairs");
  const { lairId } = await params;
  
  // Vérifier l'authentification
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  // Vérifier que l'utilisateur est admin ou owner du lair
  const canManage = await checkAdminOrOwner(lairId);
  if (!canManage) {
    redirect(`/lairs/${lairId}`);
  }

  const lair = await getLairById(lairId);

  if (!lair) {
    notFound();
  }

  // Récupérer les détails des jeux
  const gamesDetails = await Promise.all(
    lair.games.map(async (gameId) => {
      const game = await getGameById(gameId);
      return game;
    })
  );
  const games = gamesDetails.filter((game): game is NonNullable<typeof game> => game !== null);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* En-tête */}
        <div className="mb-8">
          <Button variant="ghost" asChild className="mb-4">
            <Link href={`/lairs/${lairId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("eventNew.backToLair")}
            </Link>
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <CalendarPlus className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">{t("eventNew.title")}</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            {t("eventNew.description", { name: lair.name })}
          </p>
        </div>

        {/* Formulaire */}
        <Card>
          <CardHeader>
            <CardTitle>{t("eventNew.formTitle")}</CardTitle>
            <CardDescription>
              {t("eventNew.formDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventForm lairId={lairId} games={games} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
