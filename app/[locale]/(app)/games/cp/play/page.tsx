import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { CpLobby } from "@/components/play/cyberpunk/CpLobby.tsx";

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Games.PlayCp");
  return {
    title: `Joutes - ${t("title")}`,
    description: t("description"),
    openGraph: {
      url: "https://joutes.app/games/cp/play",
      siteName: "Joutes",
      title: `Joutes - ${t("title")}`,
      description: t("description"),
    },
  };
}

export default function CpPlayPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="game" game="cp">
      <CpLobby />
    </PlayShell>
  );
}
