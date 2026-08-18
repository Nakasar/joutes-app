import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import HalloweenSeasonBanner from "@/components/HalloweenSeasonBanner";

type HomeProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
    gameId?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

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
      {/* Hors saison — et hors habillage — le bandeau ne rend rien. */}
      <div className="container mx-auto px-4">
        <HalloweenSeasonBanner />
      </div>
      <EventsCalendarWrapper searchParams={params} />
    </div>
  );
}
