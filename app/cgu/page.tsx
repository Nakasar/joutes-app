import { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { DateTime } from "luxon";
import { LegalDocumentView } from "@/components/legal/LegalDocument";
import { cguFr } from "./content.fr";
import { cguEn } from "./content.en";

/**
 * Date de la version en vigueur, partagée par toutes les langues : une
 * traduction ne porte pas sa propre date, elle traduit la même version.
 */
const LAST_UPDATED = "2026-08-04";

/**
 * La langue vient du sélecteur de l'en-tête (cookie `NEXT_LOCALE`), comme
 * partout ailleurs sur le site. Les langues sans traduction dédiée retombent
 * sur le texte français, seul texte contractuel.
 */
function getContent(locale: string) {
  return locale === "en" ? cguEn : cguFr;
}

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = getContent(await getLocale());

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    openGraph: {
      title: `${meta.title} - Joutes`,
      description: meta.description,
    },
  };
}

export default async function CGUPage() {
  const locale = await getLocale();

  return (
    <LegalDocumentView
      content={getContent(locale)}
      formattedDate={DateTime.fromISO(LAST_UPDATED)
        .setLocale(locale)
        .toLocaleString(DateTime.DATE_FULL)}
    />
  );
}
