"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { PlayerShell } from "../PlayerShell.tsx";
import { usePlayerTournament } from "../usePlayerTournament.ts";
import { TournamentFormEditor } from "../../TournamentFormEditor.tsx";

/**
 * Réponses du joueur au formulaire d'inscription. Le portail ne connaît que
 * ses propres réponses : la route dédiée les sert au joueur concerné et à
 * l'organisation, pas aux autres participants.
 */
export default function TournamentPlayerFormPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const t = useTranslations("Tournaments");
  const { tournamentId } = use(params);
  const { syncKey, tournament, myPlayerId, error, loading, apiFetch } =
    usePlayerTournament(tournamentId);

  return (
    <PlayerShell
      tournamentId={tournamentId}
      active="form"
      tournament={tournament}
      syncKey={syncKey}
      myPlayerId={myPlayerId}
      loading={loading}
      error={error}
    >
      <section className="rounded-xl border bg-card p-4">
        <h1 className="text-base font-bold tracking-tight">{t("form.playerTitle")}</h1>
        <p className="mb-3.5 mt-0.5 text-[13px] text-muted-foreground">
          {t("form.playerDescription")}
        </p>
        {myPlayerId ? (
          <TournamentFormEditor
            endpoint={`/api/tournaments/${tournamentId}/players/${myPlayerId}/form`}
            apiFetch={apiFetch}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("form.playerUnknown")}</p>
        )}
      </section>
    </PlayerShell>
  );
}
