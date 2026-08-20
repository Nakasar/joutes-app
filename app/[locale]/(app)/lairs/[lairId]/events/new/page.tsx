import { getLairById } from "@/lib/db/lairs.ts";
import { getGameById } from "@/lib/db/games.ts";
import { auth } from "@/lib/auth.ts";
import { checkAdminOrOwner } from "@/lib/middleware/admin.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Metadata } from "next";
import EventForm from "./EventForm.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";

type Props = { params: Promise<{ locale: string; lairId: string }> };

export async function generateMetadata({
  params
}: {
  params: Promise<{ lairId: string }>
}): Promise<Metadata> {
  const { lairId } = await params;
  const t = await getTranslations("Lairs");

  // Même piège Mongo que dans le corps, à désarmer une seconde fois : les
  // métadonnées s'exécutent hors de la frontière de la page.
  await connection();

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

/**
 * Le cadre — retour, titre, en-tête du formulaire — ne dépend que de la langue
 * et de l'identifiant du lair : il reste dans la coquille. Seuls la phrase qui
 * nomme le lair et le formulaire attendent la porte.
 */
export default async function NewEventPage({ params }: Props) {
  const { locale, lairId } = await params;
  // Le bouton de retour est un `Link` localisé, resté dans la coquille : sans
  // cet appel, next-intl relit la langue à la requête et rend toute la route
  // dynamique.
  setRequestLocale(locale);

  const t = await getTranslations("Lairs");

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
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
          {/* La phrase nomme le lair : elle attend la porte, comme le
              formulaire. Sa place est réservée pour que rien ne saute. */}
          <Suspense fallback={<div className="h-7 w-96 max-w-full animate-pulse rounded bg-muted/60" aria-hidden />}>
            <LairIntro lairId={lairId} />
          </Suspense>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("eventNew.formTitle")}</CardTitle>
            <CardDescription>
              {t("eventNew.formDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<EditorFormSkeleton fields={4} />}>
              <NewEventForm lairId={lairId} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * La porte, une fois : session, puis droit de gestion sur ce lair.
 *
 * Elle est franchie deux fois — ici et dans le formulaire — parce que les deux
 * morceaux rendent séparément. C'est deux vérifications au lieu d'une, contre
 * la certitude qu'aucun des deux ne s'affiche sans elle.
 */
async function requireLairManager(lairId: string) {
  // Le pilote Mongo touche à l'horloge en lisant le lair, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const canManage = await checkAdminOrOwner(lairId);
  if (!canManage) {
    redirect(`/lairs/${lairId}`);
  }

  const lair = await getLairById(lairId);
  if (!lair) {
    notFound();
  }

  return lair;
}

async function LairIntro({ lairId }: { lairId: string }) {
  const [lair, t] = await Promise.all([
    requireLairManager(lairId),
    getTranslations("Lairs"),
  ]);

  return (
    <p className="text-muted-foreground text-lg">
      {t("eventNew.description", { name: lair.name })}
    </p>
  );
}

async function NewEventForm({ lairId }: { lairId: string }) {
  const lair = await requireLairManager(lairId);

  const gamesDetails = await Promise.all(
    lair.games.map(async (gameId) => getGameById(gameId))
  );
  const games = gamesDetails.filter((game): game is NonNullable<typeof game> => game !== null);

  return <EventForm lairId={lairId} games={games} />;
}
