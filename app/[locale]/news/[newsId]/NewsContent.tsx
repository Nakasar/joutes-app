"use client";

import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import { CardNameMatch } from "@/lib/db/cards";

type NewsContentProps = {
  content: string;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  gameSlug: string;
};

export default function NewsContent({ content, cardIdByName, cardsById, gameSlug }: NewsContentProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <AnnotatedMarkdown
        content={content}
        cardIdByName={cardIdByName}
        cardsById={cardsById}
        gameSlug={gameSlug}
        ruleLang="fr"
      />
    </div>
  );
}
