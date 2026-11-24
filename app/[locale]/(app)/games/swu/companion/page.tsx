import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { CompanionPage, companionMetadata } from "@/components/companion/CompanionPage.tsx";
import { SwuCompanion } from "@/components/companion/SwuCompanion.tsx";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  return companionMetadata("swu", "Star Wars: Unlimited");
}

export default async function SwuCompanionPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <CompanionPage game="swu" gameName="Star Wars: Unlimited">
      <SwuCompanion />
    </CompanionPage>
  );
}
