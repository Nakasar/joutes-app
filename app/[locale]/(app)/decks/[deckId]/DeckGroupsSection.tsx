"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { cn } from "@/lib/utils.ts";

import { listMyGroupsForDeck, setDeckInGroupAction, type MyGroupForDeck } from "./group-actions.ts";

/**
 * Les groupes de jeu où ce deck est partagé, dans la fenêtre « Partager ».
 *
 * Chaque case s'applique tout de suite, contrairement à la visibilité : mettre
 * un deck dans un groupe se défait d'un clic, et ne change rien pour qui n'est
 * pas du groupe.
 */
export function DeckGroupsSection({ deckId, open }: { deckId: string; open: boolean }) {
  const t = useTranslations("PlayGroups.hub.decks.share");
  const [groups, setGroups] = useState<MyGroupForDeck[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listMyGroupsForDeck(deckId).then((result) => {
      if (!cancelled) setGroups(result.success ? result.groups : []);
    });

    return () => {
      cancelled = true;
    };
  }, [deckId, open]);

  const toggle = (group: MyGroupForDeck, shared: boolean) => {
    startTransition(async () => {
      const result = await setDeckInGroupAction(deckId, group.id, shared);
      if (!result.success) {
        toast.error(t("error"));
        return;
      }

      setGroups((current) => current?.map((item) => (item.id === group.id ? { ...item, shared } : item)) ?? null);
      toast.success(shared ? t("added", { group: group.name }) : t("removed", { group: group.name }));
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{t("title")}</span>
      {groups === null ? (
        <div className="h-12 animate-pulse rounded-lg border bg-muted/40" aria-hidden />
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t.rich("empty", { link: (chunks) => <Link href="/play-groups" className="underline">{chunks}</Link> })}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {groups.map((group) => {
            const locked = Boolean(group.refusal) && !group.shared;

            return (
              <label
                key={group.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3.5 py-2.5",
                  locked ? "opacity-60" : "cursor-pointer hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={group.shared}
                  disabled={locked || pending}
                  onCheckedChange={(value) => toggle(group, value === true)}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
                {locked && group.refusal && (
                  <span className="shrink-0 text-xs text-muted-foreground">{t(`refusal.${group.refusal}`)}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
