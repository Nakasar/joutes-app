"use client";

import { useMemo } from "react";
import GameMarkdown from "@/components/GameMarkdown";
import { annotateErrataMarkdown } from "@/lib/errata-markdown";
import { CardNameMatch } from "@/lib/db/cards";

/**
 * Renders free-form game content (policies, news, ...) with keyword badges
 * and card-name popovers, like erratas already get. The annotation step
 * itself (`annotateErrataMarkdown`) has no server-only dependency, so it
 * runs here on the client — the only thing the server needs to provide is
 * the small `cardIdByName`/`cardsById` lookup (resolved via
 * `resolveCardMentions`), which stays correct across client-side pagination
 * without re-fetching per page.
 */
export default function AnnotatedMarkdown({
  content,
  cardIdByName,
  cardsById,
  gameSlug,
  ruleLang,
  allowRawHtml,
}: {
  content: string;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
  ruleLang: "en" | "fr";
  allowRawHtml?: boolean;
}) {
  const markdown = useMemo(
    () => annotateErrataMarkdown(content, new Map(Object.entries(cardIdByName))),
    [content, cardIdByName]
  );

  return (
    <GameMarkdown
      markdown={markdown}
      cardsById={cardsById}
      gameSlug={gameSlug}
      ruleLang={ruleLang}
      allowRawHtml={allowRawHtml}
    />
  );
}
