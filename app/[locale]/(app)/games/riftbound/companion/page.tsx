import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { CompanionPage, companionMetadata } from "@/components/companion/CompanionPage.tsx";
import { RiftboundCompanion } from "@/components/companion/RiftboundCompanion.tsx";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  return companionMetadata("riftbound", "Riftbound");
}

/** Le compagnon ne dépend ni de la session ni de l'URL : la page prérend entièrement. */
export default async function RiftboundCompanionPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <CompanionPage game="riftbound" gameName="Riftbound">
      <RiftboundCompanion />
    </CompanionPage>
  );
}
