import { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { DateTime } from "luxon";
import { LegalDocumentView, resolveLegalLocale } from "@/components/legal/LegalDocument";
import { CGU_LAST_UPDATED } from "@/lib/constants/legal";
import { cguFr } from "./content.fr";
import { cguEn } from "./content.en";

/**
 * La langue vient du sélecteur de l'en-tête (cookie `NEXT_LOCALE`), comme
 * partout ailleurs sur le site, mais elle est d'abord ramenée aux deux langues
 * réellement traduites : l'italien et l'allemand lisent le texte français,
 * seul texte contractuel, et sa date dans le même français.
 */
async function getDocument() {
  const locale = resolveLegalLocale(await getLocale());

  return {
    content: locale === "en" ? cguEn : cguFr,
    formattedDate: DateTime.fromISO(CGU_LAST_UPDATED)
      .setLocale(locale)
      .toLocaleString(DateTime.DATE_FULL),
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

export default async function CGUPage() {
  const { content, formattedDate } = await getDocument();

  return <LegalDocumentView content={content} formattedDate={formattedDate} />;
}
