"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeSyncKey } from "@/lib/tournament-sync-storage";

function JoinTournamentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tournamentId = searchParams.get("tournamentId");
    const key = searchParams.get("key");

    if (!tournamentId || !key || !key.startsWith("tpsk_")) {
      setError("Lien de synchronisation invalide.");
      return;
    }

    if (!storeSyncKey(tournamentId, key)) {
      setError(
        "Impossible d'enregistrer la clé de synchronisation sur ce navigateur (stockage local indisponible)."
      );
      return;
    }
    router.replace(`/tournaments/${tournamentId}/player`);
  }, [searchParams, router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8">
      {error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <p className="text-muted-foreground">Synchronisation du tournoi...</p>
      )}
    </div>
  );
}

export default function JoinTournamentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center p-8">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      }
    >
      <JoinTournamentInner />
    </Suspense>
  );
}
