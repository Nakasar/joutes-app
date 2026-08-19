import { Suspense } from "react";
import EventsCalendarWrapper from "@/components/EventsCalendarWrapper.tsx";
import EventsCalendarSkeleton from "@/components/EventsCalendarSkeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import {getTranslations, setRequestLocale} from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Événements",
  description: "Trouvez et organisez des évènements de jeux de cartes à collectionner et jeux de plateau près de chez vous : tournois, organized play et rencontres locales.",
  keywords: ["événements", "tournois", "jeux de cartes à collectionner", "organized play", "communauté locale"],
  openGraph: {
    url: `https://joutes.app/events`,
    siteName: 'Joutes',
    title: 'Événements - Joutes',
    description: "Trouvez et organisez des évènements de jeux de cartes à collectionner et jeux de plateau près de chez vous.",
  },
};

type EventsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    month?: string;
    year?: string;
    gameId?: string;
  }>;
};

export default async function EventsPage({ params, searchParams }: EventsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('EventsCalendar');

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 m-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            {t('title')}
          </h1>
        </div>
        {/* Organiser un évènement se fait rarement depuis un téléphone, et le
            bouton y prenait toute la largeur au-dessus du calendrier. Le menu
            de navigation garde l'entrée pour ceux qui la cherchent. */}
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/events/new">
            <Plus className="h-4 w-4 mr-2" />
            {t('createEvent')}
          </Link>
        </Button>
      </div>
      <Suspense fallback={<EventsCalendarSkeleton />}>
        <EventsCalendarWrapper basePath="/events" searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
