import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{
    month?: string;
    year?: string;
    gameId?: string;
  }>;
};

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const t = await getTranslations('EventsCalendar');

  const params = await searchParams;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 m-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            {t('title')}
          </h1>
        </div>
        <Button asChild>
          <Link href="/events/new">
            <Plus className="h-4 w-4 mr-2" />
            {t('createEvent')}
          </Link>
        </Button>
      </div>
      <EventsCalendarWrapper basePath="/events" searchParams={params} />
    </div>
  );
}
