"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Download, Ellipsis, Mail, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { cn } from "@/lib/utils";
import type { RegistrationStatus } from "@/lib/types/Event.ts";
import { initials, pageAttendees } from "@/lib/events/attendees.ts";
import {
  PARTICIPANT_FILTERS,
  PARTICIPANT_PAGE_SIZES,
  type EventManageState,
  type ParticipantFilter,
} from "@/lib/events/manage-state.ts";
import { updateParticipantRegistrationStatusAction } from "../actions.ts";
import { removeParticipantFromEvent } from "./portal/participant-actions.ts";
import AddParticipantForm, { type Participant } from "./AddParticipantForm.tsx";
import ListPagination from "./ListPagination.tsx";

const STATUSES: RegistrationStatus[] = ["REGISTERED", "PRE_REGISTERED", "EXCLUDED"];

const STATUS_BADGE: Record<RegistrationStatus, string> = {
  REGISTERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  PRE_REGISTERED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  EXCLUDED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  NOT_REGISTERED: "bg-muted text-muted-foreground",
};

function statusOf(participant: Participant): RegistrationStatus {
  return participant.registrationStatus ?? "REGISTERED";
}

function tagOf(participant: Participant): string {
  return participant.discriminator ? `${participant.username}#${participant.discriminator}` : participant.username;
}

/** Une cellule CSV : entre guillemets, guillemets doublés. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * La liste complète des inscrits, pour l'organisation : recherche (pseudo ou
 * e-mail), filtre par statut, pages, sélection pour valider ou retirer
 * plusieurs inscrits d'un coup, et export. Tout se fait sur la liste déjà
 * chargée : un événement compte au plus quelques centaines d'inscrits.
 */
export default function EventParticipantsTable({
  eventId,
  participants,
  runningState = "not-started",
  preRegistration = false,
  state,
  onStateChange,
}: {
  eventId: string;
  participants: Participant[];
  runningState?: "not-started" | "ongoing" | "completed";
  preRegistration?: boolean;
  state: EventManageState;
  onStateChange: (patch: Partial<EventManageState>) => void;
}) {
  const t = useTranslations("EventDetail.participantsTable");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toRemove, setToRemove] = useState<Participant[] | null>(null);

  const counts = useMemo(() => {
    const result: Record<ParticipantFilter, number> = { all: participants.length, REGISTERED: 0, PRE_REGISTERED: 0, EXCLUDED: 0 };
    for (const participant of participants) {
      const status = statusOf(participant);
      if (status in result) result[status as ParticipantFilter] += 1;
    }
    return result;
  }, [participants]);

  // Le rang suit l'ordre d'inscription, quels que soient la recherche et le filtre.
  const ranked = useMemo(
    () => participants.map((participant, index) => ({ participant, rank: index + 1 })),
    [participants]
  );
  const byStatus = state.status === "all"
    ? ranked
    : ranked.filter(({ participant }) => statusOf(participant) === state.status);
  const result = pageAttendees(byStatus, {
    query: state.query,
    page: state.page - 1,
    pageSize: state.pageSize,
    text: ({ participant }) => [tagOf(participant), participant.email ?? ""],
  });

  const selectedParticipants = participants.filter((participant) => selected.has(participant.id));
  const selectedPending = selectedParticipants.filter(
    (participant) => participant.type === "user" && statusOf(participant) === "PRE_REGISTERED"
  );
  const pageIds = result.items.map(({ participant }) => participant.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = (work: () => Promise<{ success: boolean; error?: string }[]>) =>
    startTransition(async () => {
      setError(null);
      const results = await work();
      const failure = results.find((item) => !item.success);
      if (failure) setError(failure.error ?? t("error"));
      setSelected(new Set());
      router.refresh();
    });

  const setStatus = (targets: Participant[], status: RegistrationStatus) =>
    run(() =>
      Promise.all(targets.map((participant) => updateParticipantRegistrationStatusAction(eventId, participant.id, status)))
    );

  const remove = (targets: Participant[]) =>
    run(async () => {
      // Un par un : chaque retrait libère une place et fait avancer la file.
      const results = [];
      for (const participant of targets) {
        results.push(await removeParticipantFromEvent(eventId, participant.id));
      }
      return results;
    });

  const exportCsv = () => {
    const rows = [
      [t("columns.rank"), t("columns.player"), t("columns.email"), t("columns.status"), t("columns.registeredAt")],
      ...byStatus.map(({ participant, rank }) => [
        String(rank),
        tagOf(participant),
        participant.email ?? "",
        t(`status.${statusOf(participant)}`),
        participant.registeredAt ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `inscrits-${eventId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const from = result.total ? result.page * state.pageSize + 1 : 0;
  const to = Math.min(result.total, result.page * state.pageSize + state.pageSize);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">{t("search")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={state.query}
            onChange={(e) => onStateChange({ query: e.target.value, page: 1 })}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </label>
        <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap gap-1.5">
          {PARTICIPANT_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={state.status === filter}
              onClick={() => onStateChange({ status: filter, page: 1 })}
              className={cn(
                "h-8 rounded-full border px-3 text-sm font-medium transition-colors",
                state.status === filter
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {t(`filters.${filter}`)} <span className="tabular-nums opacity-75">{counts[filter]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button type="button" variant="outline" onClick={exportCsv} disabled={participants.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {t("export")}
          </Button>
          <AddParticipantForm
            eventId={eventId}
            participants={participants}
            runningState={runningState}
            preRegistration={preRegistration}
            addOnly
            readOnly
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-sm font-semibold">{t("selection", { count: selected.size })}</span>
          {selectedPending.length > 0 && (
            <Button type="button" size="sm" disabled={isPending} onClick={() => setStatus(selectedPending, "REGISTERED")}>
              {t("validate")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="text-destructive hover:text-destructive"
            onClick={() => setToRemove(selectedParticipants)}
          >
            {t("remove")}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            {t("clearSelection")}
          </Button>
        </div>
      )}

      <div className={cn("relative overflow-x-auto rounded-xl border", isPending && "opacity-60")}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  aria-label={t("selectPage")}
                  checked={allPageSelected}
                  onCheckedChange={(on) => setSelected((current) => {
                    const next = new Set(current);
                    for (const id of pageIds) {
                      if (on) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  })}
                />
              </th>
              <th className="w-10 px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">{t("columns.player")}</th>
              <th className="px-3 py-2.5">{t("columns.status")}</th>
              <th className="px-3 py-2.5">{t("columns.registeredAt")}</th>
              <th className="px-3 py-2.5 text-right">
                <span className="sr-only">{t("columns.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.items.map(({ participant, rank }) => {
              const status = statusOf(participant);
              const isUser = participant.type === "user";
              return (
                <tr key={participant.id} className={cn("border-b last:border-0", selected.has(participant.id) && "bg-primary/5")}>
                  <td className="px-3 py-2.5">
                    <Checkbox
                      aria-label={t("select", { name: tagOf(participant) })}
                      checked={selected.has(participant.id)}
                      onCheckedChange={(on) => toggle(participant.id, on === true)}
                    />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{rank}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {participant.profileImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- avatars de fournisseurs d'identité variés
                        <img src={participant.profileImage} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold uppercase text-primary">
                          {initials(participant.username) || "?"}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">
                          {participant.username}
                          {participant.discriminator && (
                            <span className="font-normal text-muted-foreground">#{participant.discriminator}</span>
                          )}
                        </p>
                        {participant.email ? (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {participant.email}
                          </p>
                        ) : !isUser ? (
                          <p className="text-xs text-muted-foreground">{t("guest")}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_BADGE[status])}>
                      {t(`status.${status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {participant.registeredAt
                      ? DateTime.fromISO(participant.registeredAt, { locale }).toLocaleString(DateTime.DATETIME_MED)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {isUser && status === "PRE_REGISTERED" && (
                        <Button type="button" size="sm" disabled={isPending} onClick={() => setStatus([participant], "REGISTERED")}>
                          {t("validate")}
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="icon-sm" aria-label={t("actionsFor", { name: tagOf(participant) })}>
                            <Ellipsis className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isUser && (
                            <>
                              <DropdownMenuLabel>{t("changeStatus")}</DropdownMenuLabel>
                              {STATUSES.filter((option) => option !== status).map((option) => (
                                <DropdownMenuItem key={option} onSelect={() => setStatus([participant], option)}>
                                  {t(`status.${option}`)}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem variant="destructive" onSelect={() => setToRemove([participant])}>
                            {t("removeOne")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result.total === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {participants.length === 0 ? t("empty") : t("noResult")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{result.total > 0 ? t("range", { from, to, total: result.total }) : null}</span>
          <label className="flex items-center gap-1.5">
            {t("perPage")}
            <select
              value={state.pageSize}
              onChange={(e) => onStateChange({ pageSize: Number(e.target.value), page: 1 })}
              className="h-8 rounded-md border bg-background px-1.5 text-foreground"
            >
              {PARTICIPANT_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
        <ListPagination
          page={result.page}
          pageCount={result.pageCount}
          disabled={isPending}
          onPageChange={(page) => onStateChange({ page: page + 1 })}
        />
      </div>

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={t("removeTitle", { count: toRemove?.length ?? 0 })}
        description={t("removeDescription", {
          count: toRemove?.length ?? 0,
          name: toRemove?.[0] ? tagOf(toRemove[0]) : "",
        })}
        confirmLabel={t("remove")}
        destructive
        onConfirm={() => {
          if (toRemove) remove(toRemove);
          setToRemove(null);
        }}
      />
    </div>
  );
}
