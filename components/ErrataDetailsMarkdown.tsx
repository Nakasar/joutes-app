"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { KeywordBadge } from "@/components/games/KeywordBadge";
import CardNameHoverPopover from "@/components/CardNameHoverPopover";
import { CardNameMatch } from "@/lib/db/cards";

export default function ErrataDetailsMarkdown({
  markdown,
  cardsById,
  gameSlug,
  ruleLang,
}: {
  markdown: string;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
  ruleLang: "en" | "fr";
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith("keyword://")) {
            const id = href.slice("keyword://".length);
            return (
              <KeywordBadge id={id} asLink href={`/games/${gameSlug}/rules/CR?lang=${ruleLang}#rule-${id}`}>
                {children}
              </KeywordBadge>
            );
          }

          if (href?.startsWith("card://")) {
            const id = href.slice("card://".length);
            const card = cardsById[id];
            if (!card) return <>{children}</>;
            return (
              <CardNameHoverPopover card={card} gameSlug={gameSlug}>
                {children}
              </CardNameHoverPopover>
            );
          }

          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {children}
            </a>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
