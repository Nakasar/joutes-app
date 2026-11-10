import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { DeckCommentsWorkspace, type WorkspaceZone } from "@/components/decks/comments/DeckComments.tsx";
import { getDeckById } from "@/lib/db/decks.ts";
import { getDeckCardInfos } from "@/lib/db/deck-cards.ts";
import { getGameById } from "@/lib/db/games.ts";
import { getPlayGroupDeck } from "@/lib/db/play-group-decks.ts";
import { readCommentThread } from "@/lib/decks/comment-service.ts";
import { groupSpace } from "@/lib/decks/comments.ts";
import { deckCardIds, zoneEntries } from "@/lib/decks/contents.ts";
import { getDeckZones } from "@/lib/decks/zones.ts";
import { domainColor } from "@/lib/meta/domains.ts";

import { memberName, readGroupMembers, requirePlayGroupMember } from "../group-data.ts";
import { viewHref } from "../views.ts";

/**
 * Un deck de la bibliothèque, ouvert dans le groupe : ses cartes et le fil de
 * commentaires du groupe. Le fil appartient au groupe : un autre groupe où le
 * deck est partagé a le sien, et l'auteur garde son espace personnel sur la
 * fiche du deck.
 */
export default async function DeckInGroupView({ playGroupId, deckId }: { playGroupId: string; deckId: string }) {
  const viewer = await requirePlayGroupMember(playGroupId);
  const [link, deck, members, t] = await Promise.all([
    getPlayGroupDeck(playGroupId, deckId),
    getDeckById(deckId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.decks.open"),
  ]);
  if (!link || !deck || !viewer.userId) {
    notFound();
  }

  const [game, catalog, thread] = await Promise.all([
    getGameById(deck.gameId),
    getDeckCardInfos(deck.gameId, deckCardIds(deck.cards)),
    readCommentThread(deckId, groupSpace(playGroupId), viewer.userId),
  ]);
  if (!thread.ok) {
    notFound();
  }

  const nameById = new Map(catalog.map((card) => [card.id, card.name]));
  const zones: WorkspaceZone[] = getDeckZones(game).map((zone) => ({
    key: zone.key,
    label: zone.label,
    cards: zoneEntries(deck.cards, zone.key)
      .map((entry) => ({
        id: entry.cardId,
        name: nameById.get(entry.cardId) ?? entry.cardId,
        quantity: entry.quantity,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const isMine = deck.playerId === viewer.userId;
  const owner = isMine ? t("you") : memberName(members, deck.playerId);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={viewHref(playGroupId, "decks")}
        className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("back")}
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] break-words">{deck.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {[deck.legendName, game?.name].filter(Boolean).join(" · ")}
            <span>· {t("by", { owner })}</span>
            <span className="font-mono text-xs">v{deck.version ?? 1}</span>
            <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[.08em] uppercase">
              {t(`visibility.${deck.visibility}`)}
            </span>
          </p>
          {(deck.domains ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(deck.domains ?? []).map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <span className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
                  {domain}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isMine && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/decks/${deck.id}/edit`}>
                <Pencil aria-hidden />
                {t("edit")}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/decks/${deck.id}`}>
              <ExternalLink aria-hidden />
              {t("fullSheet")}
            </Link>
          </Button>
        </div>
      </header>

      <DeckCommentsWorkspace
        initialThread={thread.thread}
        viewerId={viewer.userId}
        deckOwnerId={deck.playerId}
        zones={zones}
      />
    </div>
  );
}
