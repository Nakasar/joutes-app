"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Info, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { domainColor } from "@/lib/meta/domains.ts";
import { cn } from "@/lib/utils.ts";

import { addDecksToGroupAction, listMyDecksForGroup, type MyDeckForGroup } from "./actions.ts";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * « Ajouter mes decks » : une recherche parmi mes decks, et la sélection en
 * dessous.
 *
 * Une liste de tous mes decks devenait illisible passé quelques dizaines : on
 * cherche par nom, légende ou jeu, et chaque deck choisi rejoint la sélection.
 * Ceux qui sont déjà dans le groupe, ou dont le jeu n'y est pas activé,
 * restent dans les résultats, grisés, avec leur raison.
 */
export function AddDecksDialog({ playGroupId, gameNames }: { playGroupId: string; gameNames: Record<string, string> }) {
  const t = useTranslations("PlayGroups.hub.decks");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [decks, setDecks] = useState<MyDeckForGroup[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = () => {
    startLoading(async () => {
      const result = await listMyDecksForGroup(playGroupId);
      if (!result.success) {
        toast.error(t(`errors.${result.error}`));
        setOpen(false);
        return;
      }
      setDecks(result.decks);
    });
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSelected([]);
      load();
    }
  };

  const toggle = (deckId: string) => {
    setSelected((current) =>
      current.includes(deckId) ? current.filter((id) => id !== deckId) : [...current, deckId],
    );
  };

  const submit = () => {
    startSaving(async () => {
      const result = await addDecksToGroupAction(playGroupId, selected);
      if (!result.success) {
        toast.error(t(`errors.${result.error}`));
        return;
      }

      toast.success(t("addedToast", { count: result.added }));
      if (result.refused.length > 0) {
        toast.warning(t("refusedToast", { count: result.refused.length }));
      }
      setOpen(false);
      router.refresh();
    });
  };

  const deckById = new Map((decks ?? []).map((deck) => [deck.id, deck]));
  const byGame = new Map<string, MyDeckForGroup[]>();
  for (const deck of decks ?? []) {
    byGame.set(deck.gameId, [...(byGame.get(deck.gameId) ?? []), deck]);
  }
  const available = (decks ?? []).filter((deck) => !deck.shared && !deck.refusal).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button type="button" onClick={() => onOpenChange(true)} className="font-semibold">
        <Plus aria-hidden />
        {t("add")}
      </Button>

      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addDescription")}</DialogDescription>
        </DialogHeader>

        {loading || decks === null ? (
          <div className="flex flex-col gap-2" aria-hidden>
            <div className="h-9 animate-pulse rounded-md border bg-card/60" />
            <div className="h-14 animate-pulse rounded-[10px] border bg-card/60" />
          </div>
        ) : decks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">{t("addEmpty")}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/decks">{t("createDeck")}</Link>
            </Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="w-full justify-start font-normal text-muted-foreground"
                  disabled={saving}
                >
                  <Search aria-hidden />
                  <span className="truncate">{t("searchMine", { count: available })}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    const deck = deckById.get(value);
                    if (!deck) return 0;
                    const haystack = normalize(
                      `${deck.name} ${deck.legendName ?? ""} ${gameNames[deck.gameId] ?? ""} ${deck.domains.join(" ")}`,
                    );
                    return normalize(search)
                      .split(/\s+/)
                      .every((word) => haystack.includes(word))
                      ? 1
                      : 0;
                  }}
                >
                  <CommandInput placeholder={t("searchMinePlaceholder")} />
                  <CommandList className="max-h-72">
                    <CommandEmpty>{t("searchMineEmpty")}</CommandEmpty>
                    {[...byGame].map(([gameId, gameDecks]) => (
                      <CommandGroup key={gameId} heading={gameNames[gameId] ?? gameId}>
                        {gameDecks.map((deck) => {
                          const locked = deck.shared || Boolean(deck.refusal);
                          const isSelected = selected.includes(deck.id);

                          return (
                            <CommandItem
                              key={deck.id}
                              value={deck.id}
                              disabled={locked}
                              onSelect={() => toggle(deck.id)}
                              className="gap-2.5"
                            >
                              <Check
                                className={cn("size-4 shrink-0", isSelected || deck.shared ? "opacity-100" : "opacity-0")}
                                aria-hidden
                              />
                              <DeckLine deck={deck} visibility={t(`visibility.${deck.visibility}`)} />
                              {locked && (
                                <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                                  {deck.shared ? t("alreadyShared") : t(`refusal.${deck.refusal!}`)}
                                </span>
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {selected.length === 0 ? (
                <p className="rounded-[10px] border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
                  {t("selectionEmpty")}
                </p>
              ) : (
                selected.map((deckId) => {
                  const deck = deckById.get(deckId);
                  if (!deck) return null;

                  return (
                    <div
                      key={deck.id}
                      className="flex items-center gap-3 rounded-[10px] border border-[var(--group-accent)] bg-[var(--group-accent-14)] px-3 py-2.5"
                    >
                      <DeckLine
                        deck={deck}
                        visibility={t(`visibility.${deck.visibility}`)}
                        game={gameNames[deck.gameId]}
                      />
                      {deck.visibility === "private" && (
                        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                          {t("privateHint")}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => toggle(deck.id)}
                        disabled={saving}
                        aria-label={t("unselect", { deck: deck.name })}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <p className="flex gap-2.5 rounded-[10px] border bg-card/60 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("addNotice")}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={saving || selected.length === 0}>
            {t("addConfirm", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeckLine({ deck, visibility, game }: { deck: MyDeckForGroup; visibility: string; game?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{deck.name}</span>
        {deck.domains.map((domain) => (
          <span
            key={domain}
            className="size-2 shrink-0 rounded-full"
            style={{ background: domainColor(domain) }}
            aria-hidden
          />
        ))}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {[deck.legendName, game, visibility].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}
