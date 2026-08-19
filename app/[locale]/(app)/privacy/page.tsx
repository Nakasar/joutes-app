import { Metadata } from "next";
import { getLocale, setRequestLocale } from "next-intl/server";
import { LegalDocumentView, formatLegalDate, resolveLegalLocale } from "@/components/legal/LegalDocument.tsx";
import { PRIVACY_LAST_UPDATED } from "@/lib/constants/legal.ts";
import { privacyFr } from "./content.fr.tsx";
import { privacyEn } from "./content.en.tsx";

/**
 * La langue vient du sélecteur de l'en-tête (cookie `NEXT_LOCALE`), comme
 * partout ailleurs sur le site, mais elle est d'abord ramenée aux deux langues
 * réellement traduites : l'italien et l'allemand lisent le texte français,
 * seul texte de référence, et sa date dans le même français.
 */
async function getDocument() {
  const locale = resolveLegalLocale(await getLocale());

  return {
    content: locale === "en" ? privacyEn : privacyFr,
    formattedDate: await formatLegalDate(PRIVACY_LAST_UPDATED, locale),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getDocument();

  return {
    title: content.meta.title,
    description: content.meta.description,
    keywords: content.meta.keywords,
    openGraph: {
      title: `${content.meta.title} - Joutes`,
      description: content.meta.description,
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { content, formattedDate } = await getDocument();

  return <LegalDocumentView content={content} formattedDate={formattedDate} />;
}
