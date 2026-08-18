"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { storeSyncKey } from "@/lib/tournament-sync-storage";

function JoinTournamentInner() {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tournamentId = searchParams.get("tournamentId");
    const key = searchParams.get("key");

    if (!tournamentId || !key || !key.startsWith("tpsk_")) {
      setError(t("join.invalidLink"));
      return;
    }

    if (!storeSyncKey(tournamentId, key)) {
      setError(t("join.storeError"));
      return;
    }
    router.replace(`/tournaments/${tournamentId}/player`);
  }, [searchParams, router, t]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8">
      {error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <p className="text-muted-foreground">{t("join.syncing")}</p>
      )}
    </div>
  );
}

export default function JoinTournamentPage() {
  const t = useTranslations("Tournaments");
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center p-8">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      }
    >
      <JoinTournamentInner />
    </Suspense>
  );
}
