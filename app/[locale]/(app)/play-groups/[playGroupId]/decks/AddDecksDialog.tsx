"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Info, Plus } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { domainColor } from "@/lib/meta/domains.ts";
import { cn } from "@/lib/utils.ts";

import { addDecksToGroupAction, listMyDecksForGroup, type MyDeckForGroup } from "./actions.ts";

/**
 * « Ajouter mes decks » : mes decks, rangés par jeu, à cocher.
 *
 * Ceux qui sont déjà dans le groupe restent visibles, grisés : la fenêtre dit
 * aussi ce qui est déjà partagé. Un jeu que le groupe n'a pas activé est grisé
 * de même, avec sa raison.
 */
export function AddDecksDialog({ playGroupId, gameNames }: { playGroupId: string; gameNames: Record<string, string> }) {
  const t = useTranslations("PlayGroups.hub.decks");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decks, setDecks] = useState<MyDeckForGroup[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      setSelected(new Set());
      load();
    }
  };

  const toggle = (deckId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(deckId);
      else next.delete(deckId);
      return next;
    });
  };

  const submit = () => {
    startSaving(async () => {
      const result = await addDecksToGroupAction(playGroupId, [...selected]);
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

  const byGame = new Map<string, MyDeckForGroup[]>();
  for (const deck of decks ?? []) {
    byGame.set(deck.gameId, [...(byGame.get(deck.gameId) ?? []), deck]);
  }

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

        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          {loading || decks === null ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-14 animate-pulse rounded-[10px] border bg-card/60" />
              ))}
            </div>
          ) : decks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">{t("addEmpty")}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/decks">{t("createDeck")}</Link>
              </Button>
            </div>
          ) : (
            [...byGame].map(([gameId, gameDecks]) => (
              <section key={gameId} className="flex flex-col gap-1.5">
                <h3 className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
                  {gameNames[gameId] ?? gameId}
                </h3>
                {gameDecks.map((deck) => {
                  const locked = deck.shared || Boolean(deck.refusal);
                  const checked = deck.shared || selected.has(deck.id);

                  return (
                    <label
                      key={deck.id}
                      className={cn(
                        "flex items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
                        locked ? "opacity-60" : "cursor-pointer hover:bg-accent",
                        selected.has(deck.id) && "border-[var(--group-accent)] bg-[var(--group-accent-14)]",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={locked || saving}
                        onCheckedChange={(value) => toggle(deck.id, value === true)}
                      />
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
                          {[deck.legendName, t(`visibility.${deck.visibility}`)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                        {deck.shared
                          ? t("alreadyShared")
                          : deck.refusal
                            ? t(`refusal.${deck.refusal}`)
                            : deck.visibility === "private" && selected.has(deck.id)
                              ? t("privateHint")
                              : null}
                      </span>
                    </label>
                  );
                })}
              </section>
            ))
          )}
        </div>

        <p className="flex gap-2.5 rounded-[10px] border bg-card/60 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("addNotice")}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={saving || selected.size === 0}>
            {t("addConfirm", { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
