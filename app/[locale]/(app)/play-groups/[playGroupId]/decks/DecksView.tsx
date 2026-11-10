import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Info, Layers, MessageSquare, Pin } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { DeckCoverImage } from "@/components/decks/DeckCover.tsx";
import { countDeckCommentsInSpace, listLatestCommentsInSpace, type DeckCommentCounts } from "@/lib/db/deck-comments.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { groupSpace } from "@/lib/decks/comments.ts";
import { resolveDeckCover } from "@/lib/decks/cover.ts";
import { domainColor } from "@/lib/meta/domains.ts";
import { readGroupDeckLibrary, type GroupLibraryEntry } from "@/lib/play-groups/deck-library.ts";
import {
  canPinGroupDeck,
  canRemoveGroupDeck,
  filterGroupDecks,
  pageGroupDecks,
  readGroupDeckFilters,
  type GroupDeckFilters,
} from "@/lib/play-groups/decks.ts";
import { cn } from "@/lib/utils.ts";

import { memberName, readGroupMembers, requirePlayGroupMember, type PlayGroupMemberProfile } from "../group-data.ts";
import { viewHref } from "../views.ts";
import { AddDecksDialog } from "./AddDecksDialog.tsx";
import { DeckFilterBar } from "./DeckFilterBar.tsx";
import { GroupDeckMenu } from "./GroupDeckMenu.tsx";

export type DeckSearchParams = Record<string, string | string[] | undefined>;

/** Les filtres sous leurs clés d'adresse, pour réécrire un lien qui en change un. */
function filterParams(filters: GroupDeckFilters): Record<string, string | undefined> {
  return {
    jeu: filters.gameId,
    legende: filters.legendCardId,
    membre: filters.ownerId,
    domaine: filters.domain,
    q: filters.query,
  };
}

/**
 * La bibliothèque de decks du groupe.
 *
 * Chaque membre y met les siens, tout membre les ouvre. Les filtres vivent dans
 * l'adresse, pour qu'un lien vers « les decks Riftbound de Lisa » se partage
 * tel quel ; le tri est fixe — épinglés, puis activité récente.
 */
export default async function DecksView({
  playGroupId,
  searchParams,
}: {
  playGroupId: string;
  searchParams: DeckSearchParams;
}) {
  const [viewer, library, members, games, t, locale] = await Promise.all([
    requirePlayGroupMember(playGroupId),
    readGroupDeckLibrary(playGroupId),
    readGroupMembers(playGroupId),
    readAllGames(),
    getTranslations("PlayGroups.hub.decks"),
    getLocale(),
  ]);

  // Les commentaires du fil du groupe : le compte de chaque deck, et ce qui
  // s'y est dit en dernier. Un membre arrivé hier ne voit pas tout
  // l'historique comme neuf : ses non-lus partent de son arrivée.
  const space = groupSpace(playGroupId);
  const joinedAt = members.find((member) => member.userId === viewer.userId)?.joinedAt;
  const [commentCounts, latestComments] = await Promise.all([
    viewer.userId ? countDeckCommentsInSpace(space, viewer.userId, joinedAt) : new Map<string, DeckCommentCounts>(),
    listLatestCommentsInSpace(space, 12),
  ]);
  const deckName = new Map(library.map((entry) => [entry.deck.id, entry.deck.name]));
  // Le fil d'un deck retiré du groupe se referme : ses commentaires ne se
  // montrent plus ici non plus.
  const latest = latestComments.filter((comment) => deckName.has(comment.deckId)).slice(0, 3);

  const filters = readGroupDeckFilters(searchParams);
  const params = filterParams(filters);
  const hrefWith = (patch: Record<string, string | undefined>) =>
    viewHref(playGroupId, "decks", { filters: { ...params, ...patch } });

  const gameName = new Map(games.map((game) => [game.id, game.name]));
  const ownerCount = new Set(library.map((entry) => entry.link.ownerId)).size;

  // Les choix de chaque filtre se tirent de la bibliothèque elle-même : un
  // filtre qui proposerait une légende que personne ne joue ne mènerait nulle part.
  const gameCounts = countBy(library, (entry) => entry.deck.gameId);
  const inGame = filters.gameId ? library.filter((entry) => entry.deck.gameId === filters.gameId) : library;
  const legends = [
    ...new Map(
      inGame.flatMap((entry) =>
        entry.deck.legendCardId ? [[entry.deck.legendCardId, entry.deck.legendName ?? entry.deck.legendCardId]] : [],
      ),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const owners = members
    .filter((member) => library.some((entry) => entry.link.ownerId === member.userId))
    .map((member) => ({ value: member.userId, label: member.displayName }));
  const domains = [...new Set(inGame.flatMap((entry) => entry.deck.domains ?? []))];

  const entries = filterGroupDecks(library, filters);
  // Les filtres ne portent pas la page : en changer ramène à la première.
  const { items: pageEntries, page, pageCount } = pageGroupDecks(entries, searchParams.page);
  const filtered = Object.values(params).some(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {library.length === 0 ? t("summaryEmpty") : t("summary", { decks: library.length, members: ownerCount })}
          </p>
        </div>
        <AddDecksDialog playGroupId={playGroupId} gameNames={Object.fromEntries(gameName)} />
      </header>

      {library.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              href={hrefWith({
                jeu: undefined,
                legende: undefined,
                domaine: undefined,
              })}
              active={!filters.gameId}
            >
              {t("allGames")}
              <span className="font-mono text-[11px] text-muted-foreground">{library.length}</span>
            </FilterChip>
            {[...gameCounts].map(([gameId, count]) => (
              <FilterChip
                key={gameId}
                href={hrefWith({
                  jeu: gameId,
                  legende: undefined,
                  domaine: undefined,
                })}
                active={filters.gameId === gameId}
              >
                {gameName.get(gameId) ?? gameId}
                <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
              </FilterChip>
            ))}
          </div>

          <DeckFilterBar playGroupId={playGroupId} params={params} legends={legends} owners={owners} />

          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {domains.map((domain) => (
                <FilterChip
                  key={domain}
                  href={hrefWith({
                    domaine: filters.domain === domain ? undefined : domain,
                  })}
                  active={filters.domain === domain}
                >
                  <span className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
                  {domain}
                </FilterChip>
              ))}
            </div>
          )}
        </div>
      )}

      {library.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <Layers className="size-8 text-[var(--group-accent-text)]" aria-hidden />
          <h2 className="text-lg font-bold">{t("emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
        </section>
      ) : entries.length === 0 ? (
        <section className="flex flex-col items-center gap-2 rounded-xl border bg-card/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
          {filtered && (
            <Link
              href={viewHref(playGroupId, "decks")}
              className="text-sm font-medium text-[var(--group-accent-text)] hover:underline"
            >
              {t("resetFilters")}
            </Link>
          )}
        </section>
      ) : (
        <div className={cn("grid gap-5", latest.length > 0 && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
          <div
            className={cn(
              "grid content-start gap-4 sm:grid-cols-2",
              latest.length > 0 ? "2xl:grid-cols-3" : "xl:grid-cols-3",
            )}
          >
            {pageEntries.map((entry) => (
              <GroupDeckCard
                key={entry.link.deckId}
                entry={entry}
                owner={members.find((member) => member.userId === entry.link.ownerId)}
                isMine={entry.link.ownerId === viewer.userId}
                gameName={filters.gameId ? undefined : gameName.get(entry.deck.gameId)}
                playGroupId={playGroupId}
                canRemove={Boolean(viewer.userId) && canRemoveGroupDeck(entry.link, viewer.userId!, viewer.role)}
                canPin={canPinGroupDeck(viewer.role)}
                locale={locale}
                comments={commentCounts.get(entry.deck.id)}
                labels={{
                  you: t("you"),
                  pinned: t("pinned"),
                  visibility: t(`visibility.${entry.deck.visibility}`),
                  updated: (relative: string) => t("updated", { relative }),
                  comments: (count: number) => t("comments", { count }),
                  unread: (count: number) => t("unread", { count }),
                }}
              />
            ))}
            {pageCount > 1 && (
              <nav
                aria-label={t("pagination")}
                className="col-span-full flex flex-wrap items-center justify-center gap-3 pt-2 text-sm"
              >
                <PageLink href={page > 1 ? hrefWith({ page: String(page - 1) }) : undefined} label={t("previous")}>
                  <ChevronLeft className="size-4" aria-hidden />
                </PageLink>
                <span className="text-muted-foreground">{t("page", { page, count: pageCount })}</span>
                <PageLink href={page < pageCount ? hrefWith({ page: String(page + 1) }) : undefined} label={t("next")}>
                  <ChevronRight className="size-4" aria-hidden />
                </PageLink>
              </nav>
            )}
          </div>
          {latest.length > 0 && (
            <aside className="flex flex-col gap-3 self-start rounded-xl border bg-card/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-[var(--group-accent-text)]" aria-hidden />
                {t("latestComments")}
              </h2>
              <ul className="flex flex-col gap-3">
                {latest.map((comment) => (
                  <li key={comment.id}>
                    <Link
                      href={viewHref(playGroupId, "decks", {
                        filters: { deck: comment.deckId },
                      })}
                      className="flex flex-col gap-1 rounded-lg p-1.5 -m-1.5 hover:bg-accent"
                    >
                      <span className="truncate text-xs text-muted-foreground">
                        {comment.authorId === viewer.userId ? t("you") : memberName(members, comment.authorId)} ·{" "}
                        {deckName.get(comment.deckId)}
                      </span>
                      <span className="line-clamp-2 text-[13px]">{comment.body}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {DateTime.fromISO(comment.createdAt).setLocale(locale).toRelative()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}

      <p className="flex gap-2.5 rounded-[10px] border bg-card/60 px-3.5 py-3 text-[13px] text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        {t("notice")}
      </p>
    </div>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }

  return new Map([...counts].sort((a, b) => b[1] - a[1]));
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-[13px] text-[13px] transition-colors",
        active
          ? "border-[var(--group-accent)] bg-[var(--group-accent-14)] text-[var(--group-accent-text)]"
          : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

function GroupDeckCard({
  entry,
  owner,
  isMine,
  gameName,
  playGroupId,
  canRemove,
  canPin,
  locale,
  comments,
  labels,
}: {
  entry: GroupLibraryEntry;
  owner?: PlayGroupMemberProfile;
  isMine: boolean;
  gameName?: string;
  playGroupId: string;
  canRemove: boolean;
  canPin: boolean;
  locale: string;
  comments?: DeckCommentCounts;
  labels: {
    you: string;
    pinned: string;
    visibility: string;
    updated: (relative: string) => string;
    comments: (count: number) => string;
    unread: (count: number) => string;
  };
}) {
  const { link, deck } = entry;
  const ownerName = isMine ? labels.you : (owner?.displayName ?? link.ownerId);
  const href = viewHref(playGroupId, "decks", { filters: { deck: deck.id } });
  const relative = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale(locale).toRelative() ?? "";

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        link.pinnedAt && "border-[var(--group-accent-28)]",
      )}
    >
      <div className="relative">
        <Link href={href} aria-hidden tabIndex={-1} className="block">
          <DeckCoverImage cover={resolveDeckCover(deck)} name={deck.name} className="aspect-[16/7] w-full" />
        </Link>
        {link.pinnedAt && (
          <span className="absolute top-2.5 left-2.5 inline-flex max-w-[80%] items-center gap-1.5 truncate rounded-full bg-[var(--group-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--group-accent-foreground)]">
            <Pin className="size-3 shrink-0" aria-hidden />
            {link.pinNote ? `${labels.pinned} · ${link.pinNote}` : labels.pinned}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link href={href} className="truncate text-[17px] font-semibold hover:underline">
              {deck.name}
            </Link>
            {(deck.legendName || gameName) && (
              <span className="truncate text-[13px] text-muted-foreground">
                {[deck.legendName, gameName].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          <GroupDeckMenu
            playGroupId={playGroupId}
            deckId={deck.id}
            deckName={deck.name}
            pinned={Boolean(link.pinnedAt)}
            pinNote={link.pinNote}
            canPin={canPin}
            canRemove={canRemove}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MemberDot name={ownerName} avatar={owner?.avatar} />
          <span className="min-w-0 truncate">
            {ownerName} · {labels.updated(relative)}
          </span>
          {comments && comments.total > 0 && (
            <Link href={href} className="ml-auto inline-flex shrink-0 items-center gap-1 hover:text-foreground">
              <MessageSquare className="size-3.5" aria-hidden />
              <span className="sr-only">{labels.comments(comments.total)}</span>
              <span aria-hidden>{comments.total}</span>
              {comments.unread > 0 && (
                <span className="rounded-full bg-[var(--group-accent)] px-1.5 py-px text-[10px] font-semibold text-[var(--group-accent-foreground)]">
                  {labels.unread(comments.unread)}
                </span>
              )}
            </Link>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {(deck.domains ?? []).map((domain) => (
            <span
              key={domain}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <span className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
              {domain}
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase">
            {labels.visibility}
          </span>
        </div>
      </div>
    </article>
  );
}

function MemberDot({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) {
    return (
      <span className="size-6 shrink-0 overflow-hidden rounded-full">
        {/* `next/image` refuserait l'hôte : les avatars viennent de fournisseurs externes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--group-accent-16)] text-[10px] font-bold text-[var(--group-accent-text)]"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function PageLink({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  const className = "inline-flex size-9 items-center justify-center rounded-full border";
  if (!href) {
    return (
      <span aria-disabled className={cn(className, "opacity-40")} title={label}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} title={label} className={cn(className, "hover:bg-accent")}>
      {children}
    </Link>
  );
}
