"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { AlertCircle, Clock, Hourglass } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { joinEventAction, joinEventWaitlistAction, leaveEventAction, leaveEventWaitlistAction } from "../actions.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { RegistrationStatus } from "@/lib/types/Event.ts";
import type { ViewerWaitlistStatus } from "@/lib/events/waitlist.ts";

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
};

export default function EventActions({ eventId, isParticipant, isCreator, isFull, allowJoin, runningState = 'not-started', registrationStatus, preRegistration, waitlist, waitlistOpen = false, waitlistCount = 0 }: EventActionsProps) {
  const router = useRouter();
  const t = useTranslations("EventDetail.waitlist");
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
    if (!confirm("Êtes-vous sûr de vouloir vous désinscrire de cet événement ?")) {
      return;
    }

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

  const handleLeaveWaitlist = () => {
    if (!confirm(t("leaveConfirm"))) {
      return;
    }
    void runWaitlistAction(leaveEventWaitlistAction);
  };

  if (isCreator) {
    return (
      <Alert>
        <AlertDescription>
          Vous êtes le créateur de cet événement
        </AlertDescription>
      </Alert>
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

      {isParticipant ? (
        <div className="space-y-2">
          {registrationStatus === 'PRE_REGISTERED' && (
            <Alert className="border-yellow-400 bg-yellow-50">
              <Clock className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Vous êtes pré-inscrit. L&apos;organisateur doit valider votre inscription.
              </AlertDescription>
            </Alert>
          )}
          {registrationStatus === 'EXCLUDED' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Vous avez été exclu de cet événement par l&apos;organisateur.
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleLeave}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? "Chargement..." : "Se désinscrire"}
          </Button>
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
        <Button
          onClick={handleJoin}
          disabled={loading || isFull}
          className="w-full"
        >
          {loading ? "Chargement..." : isFull ? "Événement complet" : preRegistration ? "Se pré-inscrire" : "S'inscrire"}
        </Button>
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
