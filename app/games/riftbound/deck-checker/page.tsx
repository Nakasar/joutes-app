import type { Metadata } from 'next';
import {RiftboundDeckChecker} from "@/app/games/riftbound/deck-checker/deck-checker";
import {getTranslations} from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("DeckChecker");

  return {
    title: `Joutes - ${t("title")}`,
    description: t("description"),
    openGraph: {
      url: `https://joutes.app/games/riftbound/deck-checker`,
      siteName: `Joutes`,
      title: `Joutes - ${t("title")}`,
      description: t("description"),
    },
  };
}

export default function RiftboundDeckCheckerPage() {
  return <RiftboundDeckChecker />
}