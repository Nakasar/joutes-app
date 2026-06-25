import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

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
        <Button asChild>
          <Link href="/events/new">
            <Plus className="h-4 w-4 mr-2" />
            {t('createEvent')}
          </Link>
        </Button>
      </div>
      <EventsCalendarWrapper searchParams={params} />
    </div>
  );
}
