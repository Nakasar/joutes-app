"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { AlertCircle, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { useRouter } from "@/i18n/navigation.ts";
import { acceptWaitlistOfferAction, declineWaitlistOfferAction } from "../actions.ts";

type WaitlistOfferBannerProps = {
  eventId: string;
  expiresAt: string;
};

/**
 * La place libérée offerte à la personne connectée : c'est ici que mène la
 * notification « Une place s'est libérée ». Tant qu'elle n'a pas répondu, la
 * place lui est réservée ; décliner la sort de la file.
 */
export default function WaitlistOfferBanner({ eventId, expiresAt }: WaitlistOfferBannerProps) {
  const t = useTranslations("EventDetail.waitlist");
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (accept: boolean) => {
    if (!accept && !confirm(t("declineConfirm"))) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = accept
        ? await acceptWaitlistOfferAction(eventId)
        : await declineWaitlistOfferAction(eventId);

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

  return (
    <section className="rounded-xl bg-primary p-6 text-primary-foreground space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-400 text-neutral-900">
          <Ticket className="h-6 w-6" />
        </span>
        <div className="flex-1 min-w-[16rem] space-y-1">
          <h2 className="text-lg font-semibold">{t("offerTitle")}</h2>
          <p className="text-sm opacity-80">
            {t("offerDescription", {
              date: DateTime.fromISO(expiresAt, { locale }).toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => void respond(false)}
            disabled={loading}
          >
            {t("decline")}
          </Button>
          <Button variant="secondary" onClick={() => void respond(true)} disabled={loading}>
            {loading ? t("loading") : t("accept")}
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
