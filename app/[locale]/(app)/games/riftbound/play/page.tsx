import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { PlayLobby } from "@/components/play/PlayLobby.tsx";

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Games.Play");
  return {
    title: `Joutes - ${t("title")}`,
    description: t("description"),
    openGraph: {
      url: "https://joutes.app/games/riftbound/play",
      siteName: "Joutes",
      title: `Joutes - ${t("title")}`,
      description: t("description"),
    },
  };
}

export default function RiftboundPlayPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="game">
      <PlayLobby />
    </PlayShell>
  );
}
