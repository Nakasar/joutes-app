import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";

import { pickMessages, sectionNamespaces, type MessageSection } from "@/i18n/client-messages";

/**
 * Donne aux composants client d'une section les textes qu'ils lisent, et
 * seulement ceux-là (`i18n/client-messages.ts`).
 *
 * Le fournisseur du layout racine ne porte que le commun ; celui-ci le
 * remplace pour tout ce qu'il enveloppe, d'où le commun repris dans la liste.
 * La langue vient du segment racine, comme dans le layout : un layout de
 * section peut être rendu avant que celui-ci n'ait fixé la langue.
 */
export default async function ClientMessages({
  section,
  children,
}: {
  section: MessageSection;
  children: React.ReactNode;
}) {
  const locale = await rootLocale();
  setRequestLocale(locale);
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, sectionNamespaces(section))}>
      {children}
    </NextIntlClientProvider>
  );
}
