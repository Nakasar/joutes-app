import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CompanionHub } from "@/components/companion/CompanionHub.tsx";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Games.Companion");
  return { title: `Joutes - ${t("title")}`, description: t("description") };
}

/** Le compagnon de partie, tous jeux confondus : choisir le jeu, ou reprendre. */
export default async function CompanionHubPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Games.Companion");
  return (
    <div className="container mx-auto p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{t("title")}</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
      <CompanionHub />
    </div>
  );
}
