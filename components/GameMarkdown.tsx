"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { KeywordBadge } from "@/components/games/KeywordBadge";
import CardNameHoverPopover from "@/components/CardNameHoverPopover";
import { CardNameMatch } from "@/lib/db/cards";

export default function GameMarkdown({
  markdown,
  cardsById = {},
  gameSlug,
  ruleLang,
}: {
  markdown: string;
  cardsById?: Record<string, CardNameMatch>;
  gameSlug: string;
  ruleLang: "en" | "fr";
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // react-markdown's default URL sanitizer only allows a fixed list of
      // "safe" protocols (http/https/mailto/...) and silently blanks out
      // anything else — including our keyword:// and card:// pseudo-links —
      // so keywords/card mentions would render as plain unstyled text.
      urlTransform={(url) =>
        url.startsWith("keyword://") || url.startsWith("card://") ? url : defaultUrlTransform(url)
      }
      components={{
        img: ({ src, alt }) => {
          if (typeof src === "string" && src.includes("/riot-glyphs/")) {
            return (
              <img src={src} alt={alt ?? ""} className="inline h-4 w-4 align-middle mx-0.5" />
            );
          }
          return <img src={src} alt={alt ?? ""} className="max-w-full rounded-md" />;
        },
        a: ({ href, children }) => {
          if (href?.startsWith("keyword://")) {
            const [id, shape] = href.slice("keyword://".length).split("/");
            return (
              <KeywordBadge
                id={id}
                shape={shape === "arrow" ? "arrow" : undefined}
                asLink
                href={`/games/${gameSlug}/rules/CR?lang=${ruleLang}#rule-${id}`}
              >
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
