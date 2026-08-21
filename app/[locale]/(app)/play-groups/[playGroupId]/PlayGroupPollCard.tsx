"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { useLocale, useTranslations } from "next-intl";
import { CalendarSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";

import { confirmPlayGroupSlot, togglePlayGroupSlot, type PlayGroupActionResult } from "./actions.ts";

/**
 * Le sondage de disponibilités.
 *
 * Chaque créneau montre la même chose que le vote : sa part du groupe. La
 * jauge se lit sur l'effectif total, pas sur le meilleur créneau — savoir
 * qu'un créneau réunit 9 membres sur 12 dit s'il faut le confirmer, alors
 * qu'une jauge relative dirait seulement qu'il est le moins mauvais.
 */
export default function PlayGroupPollCard({
  playGroupId,
  session,
  memberCount,
  authorName,
  currentUserId,
  canManage,
}: {
  playGroupId: string;
  session: PlayGroupSession;
  memberCount: number;
  authorName: string;
  currentUserId: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("PlayGroups.hub.poll");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  const slots = session.slots ?? [];
  const leading = slots.reduce<(typeof slots)[number] | null>(
    (best, slot) => (!best || slot.voterIds.length > best.voterIds.length ? slot : best),
    null,
  );

  const report = (result: PlayGroupActionResult) => {
    if (!result.success) {
      toast.error(t("error"));
    }
  };

  const onToggle = (slotId: string) => {
    setBusySlotId(slotId);
    startTransition(async () => {
      report(await togglePlayGroupSlot(playGroupId, session.id, slotId));
      setBusySlotId(null);
    });
  };

  const onConfirm = (slotId: string) => {
    startTransition(async () => {
      report(await confirmPlayGroupSlot(playGroupId, session.id, slotId));
    });
  };

  const closesAt = session.pollClosesAt ? DateTime.fromISO(session.pollClosesAt).setLocale(locale) : null;

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarSearch className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{session.title}</h2>
        <span className="rounded-full bg-[var(--group-accent-16)] px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-[var(--group-accent-text)] uppercase">
          {t("badge")}
        </span>
        <p className="ml-auto text-xs text-muted-foreground">
          {closesAt?.isValid
            ? t("openedByUntil", { author: authorName, date: closesAt.toFormat("cccc d LLLL") })
            : t("openedBy", { author: authorName })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {slots.map((slot) => {
          const date = DateTime.fromISO(slot.startsAt).setLocale(locale);
          const mine = currentUserId ? slot.voterIds.includes(currentUserId) : false;
          const ratio = memberCount > 0 ? Math.min(1, slot.voterIds.length / memberCount) : 0;

          return (
            <div
              key={slot.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-[10px] border p-3.5",
                mine ? "border-[var(--group-accent-40)] bg-[var(--group-accent-10)]" : "bg-background/40",
              )}
            >
              <p className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
                {date.isValid ? date.toFormat("ccc d") : slot.startsAt}
              </p>
              <p className="text-sm font-semibold">{date.isValid ? date.toFormat("HH'h'mm") : null}</p>

              <div className="flex items-center gap-2.5">
                <span className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-muted">
                  <span
                    className={cn("block h-full rounded-[3px]", mine ? "bg-[var(--group-accent)]" : "bg-foreground/40")}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{slot.voterIds.length}</span>
              </div>

              <Button
                variant={mine ? "default" : "outline"}
                size="sm"
                className="w-full"
                disabled={pending && busySlotId === slot.id}
                onClick={() => onToggle(slot.id)}
              >
                {mine ? t("availableYes") : t("available")}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-[13px] text-muted-foreground">
          {leading && leading.voterIds.length > 0
            ? t("leading", {
                date: DateTime.fromISO(leading.startsAt).setLocale(locale).toFormat("cccc d"),
                count: leading.voterIds.length,
                total: memberCount,
              })
            : t("noVoteYet")}
        </p>

        {canManage && leading ? (
          <Button size="sm" disabled={pending} onClick={() => onConfirm(leading.id)}>
            {t("confirm", { date: DateTime.fromISO(leading.startsAt).setLocale(locale).toFormat("cccc d") })}
          </Button>
        ) : (
          <p className="font-mono text-[11px] text-muted-foreground">{t("adminOnly")}</p>
        )}
      </div>
    </section>
  );
}
