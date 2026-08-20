import { getLairById } from "@/lib/db/lairs.ts";
import { getGameById } from "@/lib/db/games.ts";
import { auth } from "@/lib/auth.ts";
import { checkAdminOrOwner } from "@/lib/middleware/admin.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Suspense, cache } from "react";
import { Metadata } from "next";
import EventForm from "./EventForm.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { getTranslations } from "next-intl/server";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";

type Props = { params: Promise<{ lairId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
 * Rien de traduit ne reste dans la coquille, et c'est structurel.
 *
 * Traduire demande `setRequestLocale`, qui demande la langue, donc
 * `await params` — une lecture de requête sur une route à segment dynamique.
 * La chaîne se referme : **sur ces routes, rien de localisé ne peut tenir dans
 * la coquille.** Une première version gardait l'en-tête devant et n'obtenait
 * qu'un cadre d'application, sans une ligne de la page.
 *
 * Ce qui reste devant est donc muet : les conteneurs et deux silhouettes.
 */
export default function NewEventPage({ params }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <Suspense fallback={<EventNewHeaderSkeleton />}>
            <EventNewHeader params={params} />
          </Suspense>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Suspense fallback={<EditorFormSkeleton fields={4} />}>
              <NewEventForm params={params} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EventNewHeaderSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-9 w-40 rounded-md bg-muted" />
      <div className="h-10 w-80 max-w-full rounded bg-muted" />
      <div className="h-7 w-96 max-w-full rounded bg-muted/60" />
    </div>
  );
}

/**
 * La porte : session, puis droit de gestion sur ce lieu.
 *
 * Deux frontières la franchissent — l'en-tête et le formulaire — parce qu'elles
 * rendent séparément. Sans mémoïsation, c'était deux vérifications de session et
 * deux lectures Mongo pour une même réponse.
 *
 * `cache` de React mémoïse l'appel pour la durée d'un rendu : la seconde
 * frontière reçoit la promesse de la première. Même motif que
 * `events/[eventId]/portal/portalSettings.ts`, et pour la même raison.
 */
const requireLairManager = cache(async (lairId: string) => {
  // Le pilote Mongo touche à l'horloge en lisant le lieu, ce qu'un prérendu ne
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
});

async function EventNewHeader({ params }: Props) {
  const { lairId } = await params;
  const [lair, t] = await Promise.all([
    requireLairManager(lairId),
    getTranslations("Lairs"),
  ]);

  return (
    <>
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
    </>
  );
}

async function NewEventForm({ params }: Props) {
  const { lairId } = await params;
  const [lair, t] = await Promise.all([
    requireLairManager(lairId),
    getTranslations("Lairs"),
  ]);

  const gamesDetails = await Promise.all(
    lair.games.map(async (gameId) => getGameById(gameId))
  );
  const games = gamesDetails.filter((game): game is NonNullable<typeof game> => game !== null);

  return (
    <>
      <div className="mb-6 space-y-1.5">
        <h2 className="font-semibold leading-none">{t("eventNew.formTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("eventNew.formDescription")}</p>
      </div>
      <EventForm lairId={lairId} games={games} />
    </>
  );
}
