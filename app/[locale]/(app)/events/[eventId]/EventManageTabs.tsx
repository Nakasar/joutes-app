"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useUrlQuerySync } from "@/lib/navigation/use-url-query-sync.ts";
import {
  writeEventManageState,
  type EventManageState,
  type EventManageTab,
} from "@/lib/events/manage-state.ts";
import EventParticipantsTable from "./EventParticipantsTable.tsx";
import type { Participant } from "./AddParticipantForm.tsx";

/**
 * Les onglets de l'organisation : l'aperçu (la page telle que la voient les
 * joueurs, avec ses outils d'édition), les inscrits, la liste d'attente et les
 * intéressés. L'onglet ouvert et l'état de la liste des inscrits vivent dans
 * l'adresse.
 */
export default function EventManageTabs({
  initialState,
  counts,
  overview,
  waitlist,
  interested,
  participants,
}: {
  initialState: EventManageState;
  counts: { participants: number; waitlist: number; interested: number };
  overview: React.ReactNode;
  /** Absent quand l'événement n'a pas de jauge, donc pas de liste d'attente. */
  waitlist?: React.ReactNode;
  interested: React.ReactNode;
  participants: {
    eventId: string;
    list: Participant[];
    runningState?: "not-started" | "ongoing" | "completed";
    preRegistration?: boolean;
  };
}) {
  const t = useTranslations("EventDetail.tabs");
  const [state, setState] = useState<EventManageState>(() =>
    initialState.tab === "waitlist" && !waitlist ? { ...initialState, tab: "overview" } : initialState
  );
  useUrlQuerySync(writeEventManageState(state));

  const tabs: { key: EventManageTab; count?: number }[] = [
    { key: "overview" },
    { key: "participants", count: counts.participants },
    ...(waitlist ? [{ key: "waitlist" as const, count: counts.waitlist }] : []),
    { key: "interested", count: counts.interested },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label={t("label")} className="relative -mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {tabs.map(({ key, count }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`event-tab-${key}`}
            aria-selected={state.tab === key}
            aria-controls={`event-panel-${key}`}
            onClick={() => setState((current) => ({ ...current, tab: key }))}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-sm font-semibold transition-colors",
              state.tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t(key)}
            {count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  state.tab === key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`event-panel-${state.tab}`} aria-labelledby={`event-tab-${state.tab}`}>
        {state.tab === "overview" && overview}
        {state.tab === "participants" && (
          <EventParticipantsTable
            eventId={participants.eventId}
            participants={participants.list}
            runningState={participants.runningState}
            preRegistration={participants.preRegistration}
            state={state}
            onStateChange={(patch) => setState((current) => ({ ...current, ...patch }))}
          />
        )}
        {state.tab === "waitlist" && waitlist}
        {state.tab === "interested" && interested}
      </div>
    </div>
  );
}
