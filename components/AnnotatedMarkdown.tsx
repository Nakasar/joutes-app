"use client";

import { useMemo, useState } from "react";
import GameMarkdown from "@/components/GameMarkdown";
import LanguagePicker from "@/components/LanguagePicker";
import { annotateErrataMarkdown } from "@/lib/errata-markdown";
import { CardNameMatch } from "@/lib/db/cards";
import { Locale } from "@/i18n/config";

export type ContentTranslation = { lang: Locale; content: string };

/**
 * Renders free-form game content (policies, news, erratas, ...) with
 * keyword badges and card-name popovers. The annotation step itself
 * (`annotateErrataMarkdown`) has no server-only dependency, so it runs here
 * on the client — the only thing the server needs to provide is the small
 * `cardIdByName`/`cardsById` lookup (resolved via `resolveCardMentions`),
 * which stays correct across client-side pagination without re-fetching
 * per page.
 *
 * When `originalLang`/`translations` are provided, this also renders a
 * language picker and resolves which language's content to display,
 * defaulting to `interfaceLocale` when available, else `originalLang`.
 * For content types where a language choice must also affect a sibling
 * field (e.g. a policy's title), manage the language selection in the
 * parent instead and pass the already-resolved `content` here without
 * these translation props.
 */
export default function AnnotatedMarkdown({
  content,
  cardIdByName,
  cardsById,
  gameSlug,
  ruleLang,
  allowRawHtml,
  originalLang,
  translations,
  interfaceLocale,
  originalLabel,
}: {
  content: string;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
  ruleLang: "en" | "fr";
  allowRawHtml?: boolean;
  originalLang?: Locale;
  translations?: ContentTranslation[];
  interfaceLocale?: Locale;
  originalLabel?: string;
}) {
  const availableLangs = originalLang
    ? [originalLang, ...(translations ?? []).map((t) => t.lang)]
    : [];
  const [selectedLang, setSelectedLang] = useState<Locale | undefined>(
    originalLang
      ? availableLangs.includes(interfaceLocale as Locale)
        ? interfaceLocale
        : originalLang
      : undefined
  );

  const resolvedContent =
    originalLang && selectedLang && selectedLang !== originalLang
      ? translations?.find((t) => t.lang === selectedLang)?.content ?? content
      : content;

  const markdown = useMemo(
    () => annotateErrataMarkdown(resolvedContent, new Map(Object.entries(cardIdByName))),
    [resolvedContent, cardIdByName]
  );

  return (
    <div>
      {originalLang && selectedLang && (
        <div className="mb-2 flex justify-end">
          <LanguagePicker
            availableLangs={availableLangs}
            originalLang={originalLang}
            value={selectedLang}
            onChange={setSelectedLang}
            originalLabel={originalLabel}
          />
        </div>
      )}
      <GameMarkdown
        markdown={markdown}
        cardsById={cardsById}
        gameSlug={gameSlug}
        ruleLang={ruleLang}
        allowRawHtml={allowRawHtml}
      />
    </div>
  );
}
