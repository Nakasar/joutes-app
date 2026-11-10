"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Check, CheckCircle2, CornerDownRight, LayoutGrid, Link2, List, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  COMMENT_MAX_CARDS,
  COMMENT_MAX_LENGTH,
  countCommentsByCard,
  removedCommentedCards,
  type DeckCommentView,
} from "@/lib/decks/comments.ts";
import type { CommentThreadPayload } from "@/lib/decks/comment-service.ts";
import { DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Le fil de commentaires d'un deck, dans un espace (un groupe, ou l'espace
 * personnel de l'auteur).
 *
 * Le panneau est piloté de l'extérieur pour deux choses : les cartes liées au
 * commentaire en cours d'écriture, et la carte dont on filtre le fil. La liste
 * de cartes du deck ouvert dans un groupe (`DeckCommentsWorkspace`) les règle
 * d'un clic ; ailleurs, `DeckCommentsStandalone` les garde pour lui.
 */

export type CommentCardOption = { id: string; name: string };

type Filter = "all" | "general" | "cards";

type ThreadState = CommentThreadPayload;

async function call(deckId: string, init: RequestInit & { query?: string }): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`/api/decks/${deckId}/comments${init.query ?? ""}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  }).catch(() => null);
  if (!response) return { ok: false, error: "FAILED" };
  if (response.ok) return { ok: true };
  const data = await response.json().catch(() => null);

  return { ok: false, error: typeof data?.error === "string" ? data.error : "FAILED" };
}

function useThread(initial: ThreadState) {
  const [thread, setThread] = useState(initial);

  // Ouvrir le fil, c'est l'avoir lu : la pastille du rail se vide au prochain
  // rendu. Le passage précédent reste dans `thread.lastReadAt` pour souligner
  // ce qui était neuf.
  useEffect(() => {
    void fetch(`/api/decks/${initial.deckId}/comments?space=${encodeURIComponent(initial.space)}&markRead=1`).catch(
      () => null,
    );
  }, [initial.deckId, initial.space]);

  const reload = async () => {
    const response = await fetch(
      `/api/decks/${initial.deckId}/comments?space=${encodeURIComponent(initial.space)}`,
    ).catch(() => null);
    if (response?.ok) {
      const fresh = (await response.json()) as ThreadState;
      setThread({ ...fresh, lastReadAt: thread.lastReadAt });
    }
  };

  return { thread, reload };
}

export function DeckCommentsPanel({
  initialThread,
  viewerId,
  deckOwnerId,
  cards,
  draftCards,
  onDraftCardsChange,
  cardFilter,
  onCardFilterChange,
  onThreadChange,
}: {
  initialThread: ThreadState;
  viewerId: string;
  deckOwnerId: string;
  /** Les cartes actuelles du deck, pour lier un commentaire. */
  cards: CommentCardOption[];
  draftCards: string[];
  onDraftCardsChange: (cardIds: string[]) => void;
  cardFilter: string | null;
  onCardFilterChange: (cardId: string | null) => void;
  /** Prévenu à chaque rechargement du fil : la liste de cartes en tire ses pastilles. */
  onThreadChange?: (comments: DeckCommentView[]) => void;
}) {
  const t = useTranslations("DeckComments");
  const locale = useLocale();
  const { thread, reload } = useThread(initialThread);
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [pending, startTransition] = useTransition();
  const composerId = useId();

  useEffect(() => {
    onThreadChange?.(thread.comments);
  }, [thread.comments, onThreadChange]);

  const cardName = useMemo(() => new Map(cards.map((card) => [card.id, card.name])), [cards]);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(
          t.has(`errors.${result.error}`) ? t(`errors.${result.error}` as "errors.FAILED") : t("errors.FAILED"),
        );
        return;
      }
      done?.();
      await reload();
    });
  };

  const publish = () =>
    run(
      () =>
        call(thread.deckId, {
          method: "POST",
          body: JSON.stringify({ space: thread.space, body, cardIds: draftCards }),
        }),
      () => {
        setBody("");
        onDraftCardsChange([]);
      },
    );

  const open = thread.comments.filter((comment) => !comment.resolvedAt);
  const resolved = thread.comments.filter((comment) => comment.resolvedAt);
  const counts = {
    all: open.length,
    general: open.filter((comment) => comment.cards.length === 0 && !comment.deleted).length,
    cards: open.filter((comment) => comment.cards.length > 0).length,
  };

  const matches = (comment: DeckCommentView) => {
    if (cardFilter) return comment.cards.some((card) => card.id === cardFilter);
    if (filter === "general") return comment.cards.length === 0;
    if (filter === "cards") return comment.cards.length > 0;
    return true;
  };

  const visible = open.filter(matches);
  const visibleResolved = resolved.filter(matches);
  const filterName = cardFilter
    ? (cardName.get(cardFilter) ??
      thread.comments.flatMap((comment) => comment.cards).find((card) => card.id === cardFilter)?.name ??
      cardFilter)
    : null;

  const itemProps = {
    thread,
    viewerId,
    deckOwnerId,
    locale,
    pending,
    run,
    onCardClick: (cardId: string) => onCardFilterChange(cardFilter === cardId ? null : cardId),
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2.5 rounded-xl border bg-background/40 p-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) publish();
        }}
      >
        <label htmlFor={composerId} className="text-xs font-medium text-muted-foreground">
          {t("composerLabel")}
        </label>
        <Textarea
          id={composerId}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={COMMENT_MAX_LENGTH}
          rows={3}
          placeholder={t("composerPlaceholder")}
          disabled={pending}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {draftCards.map((cardId) => (
            <CardChip
              key={cardId}
              name={cardName.get(cardId) ?? cardId}
              onRemove={() => onDraftCardsChange(draftCards.filter((id) => id !== cardId))}
              removeLabel={t("unlink", { card: cardName.get(cardId) ?? cardId })}
            />
          ))}
          <CardPicker
            cards={cards}
            selected={draftCards}
            disabled={pending || draftCards.length >= COMMENT_MAX_CARDS}
            onToggle={(cardId) =>
              onDraftCardsChange(
                draftCards.includes(cardId) ? draftCards.filter((id) => id !== cardId) : [...draftCards, cardId],
              )
            }
          />
          <Button type="submit" size="sm" className="ml-auto" disabled={pending || !body.trim()}>
            {t("publish")}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        {filterName ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--group-accent,var(--primary))] bg-[var(--group-accent-14,transparent)] px-3 text-[13px]">
            {t("filterCard", { card: filterName })}
            <button type="button" onClick={() => onCardFilterChange(null)} aria-label={t("clearFilter")}>
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          (["all", "general", "cards"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                filter === key
                  ? "border-[var(--group-accent,var(--primary))] bg-[var(--group-accent-14,transparent)] font-medium"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t(`filter.${key}`)}
              <span className="font-mono text-[11px] text-muted-foreground">{counts[key]}</span>
            </button>
          ))
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
          {thread.comments.length === 0 ? t("empty") : t("emptyFiltered")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((comment) => (
            <CommentItem key={comment.id} comment={comment} {...itemProps} />
          ))}
        </ul>
      )}

      {visibleResolved.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowResolved((value) => !value)}
            className="self-start text-[13px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {showResolved ? t("hideResolved") : t("showResolved", { count: visibleResolved.length })}
          </button>
          {showResolved && (
            <ul className="flex flex-col gap-3">
              {visibleResolved.map((comment) => (
                <CommentItem key={comment.id} comment={comment} {...itemProps} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CardChip({
  name,
  removed,
  onClick,
  onRemove,
  removeLabel,
  active,
}: {
  name: string;
  removed?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  active?: boolean;
}) {
  const content = (
    <>
      <span className={cn("truncate", removed && "line-through")}>{name}</span>
    </>
  );

  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs",
        removed
          ? "text-muted-foreground"
          : "border-[var(--group-accent-34,var(--border))] text-[var(--group-accent-text,inherit)]",
        active && "bg-[var(--group-accent-14,var(--accent))]",
      )}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex min-w-0 items-center gap-1 hover:underline">
          {content}
        </button>
      ) : (
        content
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="shrink-0">
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

function CardPicker({
  cards,
  selected,
  disabled,
  onToggle,
}: {
  cards: CommentCardOption[];
  selected: string[];
  disabled?: boolean;
  onToggle: (cardId: string) => void;
}) {
  const t = useTranslations("DeckComments");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 rounded-full px-2.5 text-xs"
        >
          <Link2 className="size-3.5" aria-hidden />
          {t("linkCard")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("searchCard")} />
          <CommandList className="max-h-64">
            <CommandEmpty>{t("noCard")}</CommandEmpty>
            <CommandGroup>
              {cards.map((card) => (
                <CommandItem key={card.id} value={`${card.name} ${card.id}`} onSelect={() => onToggle(card.id)}>
                  <Check
                    className={cn("size-4", selected.includes(card.id) ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  {card.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type ItemProps = {
  comment: DeckCommentView;
  thread: ThreadState;
  viewerId: string;
  deckOwnerId: string;
  locale: string;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => void;
  onCardClick: (cardId: string) => void;
  isReply?: boolean;
};

function CommentItem({
  comment,
  thread,
  viewerId,
  deckOwnerId,
  locale,
  pending,
  run,
  onCardClick,
  isReply,
}: ItemProps) {
  const t = useTranslations("DeckComments");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");

  const author = thread.authors[comment.authorId];
  const name = comment.authorId === viewerId ? t("you") : (author?.name ?? t("someone"));
  const when = DateTime.fromISO(comment.createdAt).setLocale(locale).toRelative() ?? "";
  const isNew = Boolean(comment.authorId !== viewerId && (!thread.lastReadAt || comment.createdAt > thread.lastReadAt));

  return (
    <li
      className={cn(
        "flex flex-col gap-2",
        !isReply && "rounded-xl border bg-card p-3.5",
        comment.resolvedAt && !isReply && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Avatar name={author?.name ?? "?"} avatar={author?.avatar} />
        <span className="font-semibold text-foreground">{name}</span>
        {comment.authorId === deckOwnerId && (
          <span className="rounded-full border px-1.5 py-px text-[10px] tracking-[.06em] uppercase">
            {t("deckAuthor")}
          </span>
        )}
        {/* L'heure relative bouge entre le rendu serveur et l'hydratation. */}
        <span suppressHydrationWarning>· {when}</span>
        {comment.editedAt && <span>· {t("edited")}</span>}
        {!isReply && !comment.deleted && <span className="font-mono">v{comment.deckVersion}</span>}
        {isNew && (
          <span className="rounded-full bg-[var(--group-accent,var(--primary))] px-1.5 py-px text-[10px] font-semibold text-[var(--group-accent-foreground,var(--primary-foreground))]">
            {t("new")}
          </span>
        )}
        {comment.resolvedAt && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {t("resolvedIn", { version: comment.resolvedVersion ?? comment.deckVersion })}
          </span>
        )}
      </div>

      {comment.deleted ? (
        <p className="text-[13px] text-muted-foreground italic">{t("deleted")}</p>
      ) : (
        <>
          {!isReply && (
            <div className="flex flex-wrap gap-1.5">
              {comment.cards.length === 0 ? (
                <span className="inline-flex h-7 items-center rounded-full border px-2.5 text-xs text-muted-foreground">
                  {t("general")}
                </span>
              ) : (
                comment.cards.map((card) => (
                  <CardChip
                    key={card.id}
                    name={card.name}
                    removed={card.removed}
                    onClick={() => onCardClick(card.id)}
                  />
                ))
              )}
              {comment.cards.some((card) => card.removed) && (
                <span className="self-center text-[11px] text-muted-foreground">{t("cardRemoved")}</span>
              )}
            </div>
          )}

          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={COMMENT_MAX_LENGTH}
                rows={3}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !draft.trim()}
                  onClick={() =>
                    run(
                      () =>
                        call(thread.deckId, {
                          method: "PATCH",
                          body: JSON.stringify({
                            commentId: comment.id,
                            body: draft,
                            cardIds: comment.cards.map((card) => card.id),
                          }),
                        }),
                      () => setEditing(false),
                    )
                  }
                >
                  {t("save")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-[21px] whitespace-pre-wrap">{comment.body}</p>
          )}

          {!editing && (
            <div className="flex flex-wrap items-center gap-1">
              {!isReply && (
                <ActionButton onClick={() => setReplying((value) => !value)} disabled={pending}>
                  <CornerDownRight aria-hidden />
                  {t("reply")}
                </ActionButton>
              )}
              {comment.permissions.canResolve && (
                <ActionButton
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      call(thread.deckId, {
                        method: "PATCH",
                        body: JSON.stringify({ commentId: comment.id, resolved: !comment.resolvedAt }),
                      }),
                    )
                  }
                >
                  {comment.resolvedAt ? <RotateCcw aria-hidden /> : <CheckCircle2 aria-hidden />}
                  {comment.resolvedAt ? t("reopen") : t("resolve")}
                </ActionButton>
              )}
              {comment.permissions.canEdit && (
                <ActionButton
                  disabled={pending}
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                >
                  <Pencil aria-hidden />
                  {t("edit")}
                </ActionButton>
              )}
              {comment.permissions.canDelete && (
                <ActionButton
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("deleteConfirm"))) return;
                    run(() => call(thread.deckId, { method: "DELETE", query: `?commentId=${comment.id}` }));
                  }}
                >
                  <Trash2 aria-hidden />
                  {t("delete")}
                </ActionButton>
              )}
            </div>
          )}
        </>
      )}

      {(comment.replies.length > 0 || replying) && (
        <ul className="ml-3 flex flex-col gap-3 border-l pl-3.5">
          {comment.replies.map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              thread={thread}
              viewerId={viewerId}
              deckOwnerId={deckOwnerId}
              locale={locale}
              pending={pending}
              run={run}
              onCardClick={onCardClick}
              isReply
            />
          ))}
          {replying && (
            <li className="flex flex-col gap-2">
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                maxLength={COMMENT_MAX_LENGTH}
                rows={2}
                placeholder={t("replyPlaceholder")}
                autoFocus
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setReplying(false)} disabled={pending}>
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !reply.trim()}
                  onClick={() =>
                    run(
                      () =>
                        call(thread.deckId, {
                          method: "POST",
                          body: JSON.stringify({ space: thread.space, body: reply, parentId: comment.id }),
                        }),
                      () => {
                        setReply("");
                        setReplying(false);
                      },
                    )
                  }
                >
                  {t("reply")}
                </Button>
              </div>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

function Avatar({ name, avatar }: { name: string; avatar?: string }) {
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
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--group-accent-16,var(--muted))] text-[10px] font-bold text-[var(--group-accent-text,inherit)]"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Le panneau seul, qui garde pour lui les cartes liées et le filtre : la fiche de mon deck. */
export function DeckCommentsStandalone(props: {
  initialThread: ThreadState;
  viewerId: string;
  deckOwnerId: string;
  cards: CommentCardOption[];
}) {
  const [draftCards, setDraftCards] = useState<string[]>([]);
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  return (
    <DeckCommentsPanel
      {...props}
      draftCards={draftCards}
      onDraftCardsChange={setDraftCards}
      cardFilter={cardFilter}
      onCardFilterChange={setCardFilter}
    />
  );
}

export type WorkspaceZone = {
  key: string;
  label: string;
  cards: { id: string; name: string; quantity: number; image?: string; orientation?: "portrait" | "landscape" }[];
};

type CardLayout = "list" | "grid";
const LAYOUT_KEY = "joutes:deck-comments-layout";

function readLayout(): CardLayout {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

/**
 * Le deck ouvert dans un groupe : ses cartes par zone à gauche, le fil à
 * droite. Une carte se clique pour filtrer le fil sur elle, ou se lie d'un
 * bouton au commentaire en cours. Les cartes commentées puis retirées du deck
 * gardent leur place, à part, pour que leurs commentaires restent trouvables.
 */
export function DeckCommentsWorkspace({
  initialThread,
  viewerId,
  deckOwnerId,
  zones,
}: {
  initialThread: ThreadState;
  viewerId: string;
  deckOwnerId: string;
  zones: WorkspaceZone[];
}) {
  const t = useTranslations("DeckComments");
  const [draftCards, setDraftCards] = useState<string[]>([]);
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [comments, setComments] = useState<DeckCommentView[]>(initialThread.comments);
  const [tab, setTab] = useState<"cards" | "comments">("comments");
  // Liste ou vignettes : un choix de lecteur, gardé dans son navigateur.
  const [layout, setLayout] = useState<CardLayout>("list");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le stockage n'existe qu'au navigateur
    setLayout(readLayout());
  }, []);
  const chooseLayout = (next: CardLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Navigation privée : le choix vaut pour cette visite.
    }
  };

  const counts = useMemo(() => countCommentsByCard(comments), [comments]);
  const removed = useMemo(() => removedCommentedCards(comments), [comments]);
  const cards = useMemo(() => {
    const seen = new Map<string, CommentCardOption>();
    for (const zone of zones) for (const card of zone.cards) seen.set(card.id, { id: card.id, name: card.name });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [zones]);

  const filterOn = (cardId: string) => {
    setCardFilter(cardFilter === cardId ? null : cardId);
    setTab("comments");
  };
  const link = (cardId: string) => {
    if (!draftCards.includes(cardId) && draftCards.length < COMMENT_MAX_CARDS) {
      setDraftCards([...draftCards, cardId]);
    }
    setTab("comments");
  };

  const row = (card: { id: string; name: string; quantity?: number }, isRemoved = false) => {
    const count = counts[card.id] ?? 0;
    const active = cardFilter === card.id;

    return (
      <li
        key={card.id}
        className={cn(
          "group flex items-center gap-2 rounded-lg px-2 py-1.5",
          active && "bg-[var(--group-accent-14,var(--accent))]",
        )}
      >
        <button
          type="button"
          onClick={() => filterOn(card.id)}
          aria-pressed={active}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          {card.quantity !== undefined && (
            <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{card.quantity}</span>
          )}
          <span className={cn("min-w-0 truncate", isRemoved && "text-muted-foreground line-through")}>{card.name}</span>
          {count > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-[var(--group-accent-16,var(--muted))] px-1.5 py-px font-mono text-[11px] text-[var(--group-accent-text,inherit)]">
              {count}
            </span>
          )}
        </button>
        {!isRemoved && (
          <button
            type="button"
            onClick={() => link(card.id)}
            aria-label={t("linkThis", { card: card.name })}
            title={t("linkThis", { card: card.name })}
            disabled={draftCards.includes(card.id)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <Link2 className="size-3.5" aria-hidden />
          </button>
        )}
      </li>
    );
  };

  const tile = (card: WorkspaceZone["cards"][number]) => {
    const count = counts[card.id] ?? 0;
    const active = cardFilter === card.id;

    return (
      <li key={card.id} className="relative">
        <button
          type="button"
          onClick={() => filterOn(card.id)}
          aria-pressed={active}
          aria-label={`${card.quantity} × ${card.name}`}
          className={cn(
            "block w-full rounded-lg outline-offset-2",
            active && "outline-2 outline-[var(--group-accent,var(--primary))]",
          )}
        >
          <DeckCardThumb card={{ id: card.id, name: card.name, image: card.image, orientation: card.orientation }} />
        </button>
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-px font-mono text-[11px] text-white">
          ×{card.quantity}
        </span>
        {count > 0 && (
          <span className="pointer-events-none absolute top-1 right-1 rounded-full bg-[var(--group-accent,var(--primary))] px-1.5 py-px font-mono text-[11px] font-semibold text-[var(--group-accent-foreground,var(--primary-foreground))]">
            {count}
          </span>
        )}
        <button
          type="button"
          onClick={() => link(card.id)}
          aria-label={t("linkThis", { card: card.name })}
          title={t("linkThis", { card: card.name })}
          disabled={draftCards.includes(card.id)}
          className="absolute right-1 bottom-1 rounded-md bg-black/75 p-1 text-white hover:bg-black disabled:opacity-40"
        >
          <Link2 className="size-3.5" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-lg border p-0.5 lg:hidden" role="tablist">
        {(["comments", "cards"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm",
              tab === key ? "bg-accent font-medium" : "text-muted-foreground",
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className={cn("flex flex-col gap-4", tab !== "cards" && "max-lg:hidden")} aria-label={t("tabs.cards")}>
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t("cardsHint")}</p>
            <div className="flex shrink-0 rounded-md border p-0.5">
              {(["list", "grid"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={layout === key}
                  aria-label={t(`layout.${key}`)}
                  title={t(`layout.${key}`)}
                  onClick={() => chooseLayout(key)}
                  className={cn(
                    "rounded p-1.5 text-muted-foreground",
                    layout === key && "bg-accent text-foreground",
                  )}
                >
                  {key === "list" ? <List className="size-3.5" aria-hidden /> : <LayoutGrid className="size-3.5" aria-hidden />}
                </button>
              ))}
            </div>
          </div>
          {zones
            .filter((zone) => zone.cards.length > 0)
            .map((zone) => (
              <div key={zone.key} className="flex flex-col gap-1">
                <h3 className="px-2 font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
                  {zone.label} · {zone.cards.reduce((total, card) => total + card.quantity, 0)}
                </h3>
                {layout === "grid" ? (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">{zone.cards.map((card) => tile(card))}</ul>
                ) : (
                  <ul className="flex flex-col">{zone.cards.map((card) => row(card))}</ul>
                )}
              </div>
            ))}
          {removed.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-dashed p-2">
              <h3 className="px-2 font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
                {t("removedCards")}
              </h3>
              <ul className="flex flex-col">{removed.map((card) => row(card, true))}</ul>
            </div>
          )}
        </section>

        <section className={cn(tab !== "comments" && "max-lg:hidden")} aria-label={t("tabs.comments")}>
          <DeckCommentsPanel
            initialThread={initialThread}
            viewerId={viewerId}
            deckOwnerId={deckOwnerId}
            cards={cards}
            draftCards={draftCards}
            onDraftCardsChange={setDraftCards}
            cardFilter={cardFilter}
            onCardFilterChange={setCardFilter}
            onThreadChange={setComments}
          />
        </section>
      </div>
    </div>
  );
}
