import { Suspense } from "react";
import EventsCalendarWrapper from "@/components/EventsCalendarWrapper.tsx";
import EventsCalendarSkeleton from "@/components/EventsCalendarSkeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import {getTranslations, setRequestLocale} from "next-intl/server";
import HalloweenSeasonBanner from "@/components/HalloweenSeasonBanner.tsx";

type HomeProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    month?: string;
    year?: string;
    gameId?: string;
  }>;
};

export default async function Home({ params, searchParams }: HomeProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Home');

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 m-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            {t('title')}
          </h1>
        </div>
        {/* Même en-tête que `/events`, même raison de le masquer sur mobile. */}
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/events/new">
            <Plus className="h-4 w-4 mr-2" />
            {t('createEvent')}
          </Link>
        </Button>
      </div>
      {/*
        Le bandeau lit la session pour compter les événements de la personne :
        il lui faut sa propre frontière, comme au calendrier, sinon il sortirait
        la page entière du prérendu.

        Pas de squelette : hors saison, hors habillage ou déconnecté — le cas
        courant — il ne rend rien du tout. Une plaque grise annoncerait un
        contenu qui, le plus souvent, ne viendra pas.
      */}
      <Suspense fallback={null}>
        <div className="container mx-auto px-4">
          <HalloweenSeasonBanner />
        </div>
      </Suspense>
      <Suspense fallback={<EventsCalendarSkeleton />}>
        <EventsCalendarWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
