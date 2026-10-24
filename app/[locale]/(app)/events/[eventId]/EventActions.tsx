"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { AlertCircle, CalendarPlus, CheckCircle2, Clock, Hourglass } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { joinEventAction, joinEventWaitlistAction, leaveEventAction, leaveEventWaitlistAction } from "../actions.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { RegistrationStatus } from "@/lib/types/Event.ts";
import type { ViewerWaitlistStatus } from "@/lib/events/waitlist.ts";
import { buildEventIcs } from "@/lib/events/ics.ts";

type EventActionsProps = {
  eventId: string;
  isParticipant: boolean;
  isCreator: boolean;
  isFull: boolean;
  allowJoin?: boolean;
  runningState?: 'not-started' | 'ongoing' | 'completed';
  registrationStatus?: RegistrationStatus;
  preRegistration?: boolean;
  /** Place de la personne connectée dans la liste d'attente, si elle y est. */
  waitlist?: ViewerWaitlistStatus | null;
  /** La file accepte-t-elle de nouveaux joueurs ? */
  waitlistOpen?: boolean;
  waitlistCount?: number;
  /** Date d'inscription de la personne connectée (ISO), si connue. */
  registeredAt?: string;
  /** De quoi écrire le fichier d'agenda de l'événement. */
  calendar: {
    name: string;
    startDateTime: string;
    endDateTime: string;
    location?: string;
  };
};

export default function EventActions({ eventId, isParticipant, isCreator, isFull, allowJoin, runningState = 'not-started', registrationStatus, preRegistration, waitlist, waitlistOpen = false, waitlistCount = 0, registeredAt, calendar }: EventActionsProps) {
  const router = useRouter();
  const t = useTranslations("EventDetail.waitlist");
  const tReg = useTranslations("EventDetail.registrationCard");
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEventStartedOrCompleted = runningState !== 'not-started';

  const handleJoin = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await joinEventAction(eventId);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    setConfirmingLeave(false);
    setLoading(true);
    setError(null);

    try {
      const result = await leaveEventAction(eventId);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  // Même enveloppe pour les deux gestes de la file : erreur affichée, page
  // rafraîchie pour relire la position.
  const runWaitlistAction = async (action: (eventId: string) => Promise<{ success: boolean; error?: string }>) => {
    setLoading(true);
    setError(null);

    try {
      const result = await action(eventId);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || t("error"));
      }
    } catch (err) {
      console.error(err);
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  };

  // Le fichier est écrit sur place : pas de route à appeler, et l'agenda du
  // joueur ramène les heures UTC à son fuseau.
  const downloadIcs = () => {
    const ics = buildEventIcs({
      id: eventId,
      ...calendar,
      url: `${window.location.origin}/events/${eventId}`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${calendar.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "evenement"}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLeaveWaitlist = () => {
    if (!confirm(t("leaveConfirm"))) {
      return;
    }
    void runWaitlistAction(leaveEventWaitlistAction);
  };

  if (isCreator) {
    return (
      <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        {tReg("creator")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isParticipant && confirmingLeave ? (
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5">
          <p className="text-sm font-semibold">{tReg(registrationStatus === 'PRE_REGISTERED' ? "cancelRequestTitle" : "leaveTitle")}</p>
          <p className="text-sm text-muted-foreground">{tReg("leaveDescription")}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setConfirmingLeave(false)} disabled={loading}>
              {tReg("stay")}
            </Button>
            <Button type="button" variant="destructive" size="sm" className="flex-1" onClick={() => void handleLeave()} disabled={loading}>
              {loading ? t("loading") : tReg("confirmLeave")}
            </Button>
          </div>
        </div>
      ) : isParticipant ? (
        <div className="space-y-2">
          {registrationStatus === 'PRE_REGISTERED' ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{tReg("pendingTitle")}</p>
                <p className="text-xs">{tReg("pendingDescription")}</p>
              </div>
            </div>
          ) : registrationStatus === 'EXCLUDED' ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{tReg("excluded")}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{tReg("registeredTitle")}</p>
                {registeredAt && (
                  <p className="text-xs">
                    {tReg("registeredSince", {
                      date: DateTime.fromISO(registeredAt, { locale }).toLocaleString(DateTime.DATETIME_MED),
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
          {registrationStatus !== 'EXCLUDED' && (
            <Button type="button" variant="outline" className="w-full" onClick={downloadIcs}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              {tReg("addToCalendar")}
            </Button>
          )}
          {!isEventStartedOrCompleted && registrationStatus !== 'EXCLUDED' && (
            <Button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              disabled={loading}
              variant="ghost"
              className="w-full text-destructive hover:text-destructive"
            >
              {tReg(registrationStatus === 'PRE_REGISTERED' ? "cancelRequest" : "leave")}
            </Button>
          )}
        </div>
      ) : waitlist ? (
        <div className="space-y-2">
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <Hourglass className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("position", { position: waitlist.position })}</p>
              <p className="text-xs">
                {t("positionDetail", {
                  date: DateTime.fromISO(waitlist.joinedAt, { locale }).toLocaleString(DateTime.DATETIME_MED),
                })}
              </p>
            </div>
          </div>
          <Button
            onClick={handleLeaveWaitlist}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? t("loading") : t("leave")}
          </Button>
        </div>
      ) : allowJoin && !isEventStartedOrCompleted && isFull && waitlistOpen ? (
        <div className="space-y-2">
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {t("fullExplanation")}
          </p>
          <Button
            onClick={() => void runWaitlistAction(joinEventWaitlistAction)}
            disabled={loading}
            className="w-full"
          >
            <Hourglass className="h-4 w-4 mr-2" />
            {loading ? t("loading") : t("join")}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            {t("wouldBe", { position: waitlistCount + 1 })}
          </p>
        </div>
      ) : allowJoin && !isEventStartedOrCompleted ? (
        <div className="space-y-1.5">
          <Button
            onClick={handleJoin}
            disabled={loading || isFull}
            className="h-11 w-full text-base font-semibold"
          >
            {loading ? t("loading") : isFull ? t("full") : preRegistration ? tReg("requestJoin") : tReg("join")}
          </Button>
          {preRegistration && !isFull && (
            <p className="text-xs text-muted-foreground">{tReg("requestJoinHelp")}</p>
          )}
        </div>
      ) : !allowJoin && !isEventStartedOrCompleted ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          {tReg("closed")}
        </p>
      ) : isEventStartedOrCompleted ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Les inscriptions sont fermées car l&apos;événement est {runningState === 'ongoing' ? 'en cours' : 'terminé'}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
