"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { AlertCircle, Hourglass, UserCheck, User as UserIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useRouter } from "@/i18n/navigation.ts";
import { WAITLIST_RESPONSE_HOURS_OPTIONS } from "@/lib/events/waitlist.ts";
import {
  promoteFromWaitlistAction,
  removeFromWaitlistAction,
  updateWaitlistResponseHoursAction,
} from "../actions.ts";

export type WaitlistManagerEntry = {
  userId: string;
  position: number;
  username: string;
  discriminator?: string;
  profileImage?: string;
  joinedAt: string;
  offerExpiresAt?: string;
};

type WaitlistManagerProps = {
  eventId: string;
  entries: WaitlistManagerEntry[];
  responseHours: number;
  /** Instant du rendu serveur, pour dire si une offre court encore. */
  now: string;
};

/**
 * La liste d'attente vue par l'organisation : qui attend, dans quel ordre,
 * à qui une place est proposée, et le délai laissé pour répondre.
 */
export default function WaitlistManager({ eventId, entries, responseHours, now }: WaitlistManagerProps) {
  const t = useTranslations("EventDetail.waitlist");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const formatDate = (iso: string) =>
    DateTime.fromISO(iso, { locale }).toLocaleString(DateTime.DATETIME_MED);

  const run = (action: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || t("error"));
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Hourglass className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("manager.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("manager.empty")}</p>
        ) : (
          <ol className="space-y-2">
            {entries.map((entry) => {
              const offerActive = entry.offerExpiresAt !== undefined
                && Date.parse(entry.offerExpiresAt) > Date.parse(now);
              const name = `${entry.username}${entry.discriminator ? `#${entry.discriminator}` : ""}`;

              return (
                <li
                  key={entry.userId}
                  className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${
                    offerActive ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : ""
                  }`}
                >
                  <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{entry.position}</span>
                  {entry.profileImage ? (
                    <img src={entry.profileImage} alt="" className="h-6 w-6 rounded-full" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                      <UserIcon className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                  <div className="flex-1 min-w-[8rem]">
                    <div className="text-sm font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">
                      {offerActive && entry.offerExpiresAt
                        ? t("manager.offerUntil", { date: formatDate(entry.offerExpiresAt) })
                        : t("manager.joinedAt", { date: formatDate(entry.joinedAt) })}
                    </div>
                  </div>
                  {offerActive && (
                    <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-200">
                      {t("manager.offered")}
                    </Badge>
                  )}
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => run(() => promoteFromWaitlistAction(eventId, entry.userId))}
                      disabled={isPending}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      {t("manager.promote")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("manager.remove", { name })}
                      title={t("manager.remove", { name })}
                      onClick={() => run(() => removeFromWaitlistAction(eventId, entry.userId))}
                      disabled={isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="space-y-2 border-t pt-4">
          <label htmlFor="waitlist-response-hours" className="text-sm font-medium">
            {t("manager.responseDelay")}
          </label>
          <Select
            value={String(responseHours)}
            onValueChange={(value) => run(() => updateWaitlistResponseHoursAction(eventId, Number(value)))}
            disabled={isPending}
          >
            <SelectTrigger id="waitlist-response-hours" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WAITLIST_RESPONSE_HOURS_OPTIONS.map((hours) => (
                <SelectItem key={hours} value={String(hours)}>
                  {t("manager.hours", { count: hours })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("manager.responseDelayHelp")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
