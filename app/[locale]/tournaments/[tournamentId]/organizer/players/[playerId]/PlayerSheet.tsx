"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ArrowLeft, Table as TableIcon, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  TournamentDecklist,
  TournamentPenalty,
  TournamentPenaltyType,
} from "@/lib/types/Tournament";
import { TournamentFormEditor } from "../../../TournamentFormEditor";
import { FeatAwardPicker, type TournamentFeat } from "../../../FeatAwardPicker";

const PENALTY_TYPES: TournamentPenaltyType[] = [
  "warning",
  "game-loss",
  "match-loss",
  "disqualification",
];

// Un avertissement se distingue visuellement des sanctions qui coûtent une
// partie ou le tournoi : l'arbitre doit voir la gravité d'un coup d'œil.
const PENALTY_TONE: Record<TournamentPenaltyType, string> = {
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  "game-loss":
    "border-destructive/40 bg-destructive/10 text-destructive",
  "match-loss": "border-destructive/40 bg-destructive/10 text-destructive",
  disqualification: "border-destructive bg-destructive/15 text-destructive",
};

export type SheetPlayer = {
  id: string;
  displayName: string;
  discriminator?: string;
  status: string;
  checkedInAt?: string;
  fixedTableNumber?: number;
  decklist?: TournamentDecklist;
};

export type SheetHistoryEntry = {
  roundId: string;
  roundNumber: number;
  opponentName: string;
  tableNumber?: number;
  outcome: "win" | "loss" | "draw" | "pending";
  score: string;
};

export type SheetNote = {
  id: string;
  content: string;
  roundNumber?: number;
  createdAt: string;
};

export type SheetFeatAward = {
  id: string;
  featId: string;
  matchId?: string;
  roundNumber?: number;
  createdAt: string;
};

export type SheetStanding = { rank: number; matchPoints: number; record: string } | null;

export function PlayerSheet({
  tournamentId,
  player,
  hasForm,
  standing,
  history,
  currentMatch,
  initialPenalties,
  initialNotes,
  feats,
  initialFeatAwards,
}: {
  tournamentId: string;
  player: SheetPlayer;
  /** Le tournoi a un formulaire d'inscription : la fiche montre les réponses. */
  hasForm: boolean;
  standing: SheetStanding;
  history: SheetHistoryEntry[];
  currentMatch: { roundId: string; tableNumber?: number; opponentName: string; status: string } | null;
  initialPenalties: TournamentPenalty[];
  initialNotes: SheetNote[];
  /** Catalogue de la ligue rattachée. Vide = tournoi autonome, rien à décerner. */
  feats: TournamentFeat[];
  initialFeatAwards: SheetFeatAward[];
}) {
  const t = useTranslations("Tournaments");
  const router = useRouter();

  const [penalties, setPenalties] = useState(initialPenalties);
  const [notes, setNotes] = useState(initialNotes);
  const [featAwards, setFeatAwards] = useState(initialFeatAwards);
  const [decklist, setDecklist] = useState(player.decklist);

  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [penaltyType, setPenaltyType] = useState<TournamentPenaltyType>("warning");
  const [penaltyReason, setPenaltyReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [decklistDraft, setDecklistDraft] = useState(player.decklist?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/tournaments/${tournamentId}/players/${player.id}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const call = async (path: string, init: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? t("common.error"));
    }
    return res.status === 204 ? null : res.json();
  };

  const addPenalty = () =>
    run(async () => {
      const created = await call(`${base}/penalties`, {
        method: "POST",
        body: JSON.stringify({
          type: penaltyType,
          reason: penaltyReason.trim() || undefined,
        }),
      });
      setPenalties((current) => [created, ...current]);
      setPenaltyOpen(false);
      setPenaltyReason("");
      // Une disqualification retire le joueur : son statut affiché doit suivre.
      if (penaltyType === "disqualification") router.refresh();
    });

  const removePenalty = (id: string) =>
    run(async () => {
      await call(`${base}/penalties/${id}`, { method: "DELETE" });
      setPenalties((current) => current.filter((p) => p.id !== id));
    });

  const addNote = () =>
    run(async () => {
      if (!noteText.trim()) return;
      const created = await call(`${base}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: noteText.trim() }),
      });
      setNotes((current) => [created, ...current]);
      setNoteText("");
    });

  const removeNote = (id: string) =>
    run(async () => {
      await call(`${base}/notes/${id}`, { method: "DELETE" });
      setNotes((current) => current.filter((n) => n.id !== id));
    });

  const awardFeat = (featId: string) =>
    run(async () => {
      const created = await call(`${base}/feats`, {
        method: "POST",
        body: JSON.stringify({ featId }),
      });
      setFeatAwards((current) => [created, ...current]);
    });

  const removeFeatAward = (id: string) =>
    run(async () => {
      await call(`${base}/feats/${id}`, { method: "DELETE" });
      setFeatAwards((current) => current.filter((a) => a.id !== id));
    });

  const featsById = new Map(feats.map((feat) => [feat.id, feat]));
  const awardedCounts = featAwards.reduce<Record<string, number>>((counts, awardEntry) => {
    counts[awardEntry.featId] = (counts[awardEntry.featId] ?? 0) + 1;
    return counts;
  }, {});

  const saveDecklist = (updates: { content?: string; checked?: boolean }) =>
    run(async () => {
      const saved: TournamentDecklist | null = await call(`${base}/decklist`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      setDecklist(saved ?? undefined);
      if (saved) setDecklistDraft(saved.content);
    });

  // Statut d'inscription. Un drop se défait : le joueur revenu reprend sa place
  // sans repasser par la liste.
  const setStatus = (status: "registered" | "dropped") =>
    run(async () => {
      await call(base, { method: "PATCH", body: JSON.stringify({ status }) });
      router.refresh();
    });

  // Table fixe, conservée tout le tournoi : les appariements la respectent tant
  // qu'elle n'est pas déjà prise par une autre table de la ronde. Vide = aucune.
  // La valeur affichée sort directement de la prop, jamais d'un état local : un
  // autre arbitre peut la changer, et `router.refresh()` doit pouvoir corriger
  // le champ.
  const saveFixedTable = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    if (next === (player.fixedTableNumber ?? null)) return;
    void run(async () => {
      await call(base, { method: "PATCH", body: JSON.stringify({ fixedTableNumber: next }) });
      router.refresh();
    });
  };

  const initial = player.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="p-6">
      <Link
        href={`/tournaments/${tournamentId}/organizer/players`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("playerSheet.backToList")}
      </Link>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
            {initial}
          </span>
          <div>
            <p className="text-xl font-bold tracking-tight">
              {player.displayName}
              {player.discriminator && (
                <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                  #{player.discriminator}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {standing
                ? t("playerSheet.summaryWithRank", {
                    rank: standing.rank,
                    points: standing.matchPoints,
                    record: standing.record,
                  })
                : t("playerSheet.summaryNoRank")}
              {" · "}
              {player.status === "dropped"
                ? t("common.playerStatus.dropped")
                : player.checkedInAt
                  ? t("organizerPlayers.present")
                  : t("organizerPlayers.notCheckedIn")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TableIcon className="size-4" aria-hidden="true" />
            {t("playerSheet.fixedTableLabel")}
            <Input
              key={`fixed-${player.fixedTableNumber ?? ""}`}
              type="number"
              min={0}
              max={9999}
              className="h-9 w-20"
              defaultValue={player.fixedTableNumber ?? ""}
              placeholder="—"
              onBlur={(e) => saveFixedTable(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={busy}
              aria-label={t("organizerPlayers.fixedTableAria", { name: player.displayName })}
              title={t("organizerPlayers.fixedTableTitle")}
            />
          </label>
          {player.status === "dropped" ? (
            <Button variant="outline" onClick={() => setStatus("registered")} disabled={busy}>
              {t("playerSheet.reregisterPlayer")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStatus("dropped")} disabled={busy}>
              {t("playerSheet.dropPlayer")}
            </Button>
          )}
          <Button variant="destructive" onClick={() => setPenaltyOpen(true)} disabled={busy}>
            {t("playerSheet.addPenalty")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {currentMatch && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("playerSheet.currentMatch")}</h2>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-foreground text-background">
                  <span className="text-[9px] uppercase tracking-[0.06em] opacity-70">
                    {t("roundClient.tableShort")}
                  </span>
                  <span className="font-mono text-[22px] font-bold leading-none">
                    {currentMatch.tableNumber ?? "—"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">
                    {t("playerSheet.against", { name: currentMatch.opponentName })}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {t(`common.matchStatus.${currentMatch.status}`)}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/tournaments/${tournamentId}/organizer/rounds/${currentMatch.roundId}/matches`}
                  >
                    {t("playerSheet.goToTable")}
                  </Link>
                </Button>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">
              {t("playerSheet.roundHistory")}
            </h2>
            {history.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t("playerSheet.noHistory")}
              </p>
            ) : (
              <ul className="divide-y">
                {history.map((entry) => (
                  <li key={entry.roundId} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="w-20 shrink-0 font-semibold">
                      {t("common.roundN", { number: entry.roundNumber })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {t("playerSheet.against", { name: entry.opponentName })}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {entry.tableNumber !== undefined
                        ? t("playerSheet.tableN", { table: entry.tableNumber })
                        : ""}
                    </span>
                    <span
                      className={cn(
                        "w-28 shrink-0 text-right font-semibold",
                        entry.outcome === "win"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : entry.outcome === "loss"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      )}
                    >
                      {t(`playerSheet.outcome.${entry.outcome}`)}
                      {entry.score && ` ${entry.score}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("playerSheet.decklist")}</h2>
              {decklist?.checked ? (
                <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
                  {t("playerSheet.decklistChecked")}
                </Badge>
              ) : (
                <Badge variant="outline">{t("playerSheet.decklistUnchecked")}</Badge>
              )}
            </div>
            <Textarea
              value={decklistDraft}
              onChange={(e) => setDecklistDraft(e.target.value)}
              placeholder={t("playerSheet.decklistPlaceholder")}
              className="min-h-40 font-mono text-[13px]"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t("playerSheet.decklistHint")}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || decklistDraft === (decklist?.content ?? "")}
                onClick={() => saveDecklist({ content: decklistDraft })}
              >
                {t("common.save")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !decklist}
                onClick={() => saveDecklist({ checked: !decklist?.checked })}
              >
                {decklist?.checked
                  ? t("playerSheet.decklistMarkUnchecked")
                  : t("playerSheet.decklistMarkChecked")}
              </Button>
            </div>
          </section>

          {/* Réponses au formulaire d'inscription. L'organisation les corrige
              même quand elles sont figées côté joueur : c'est elle qui tranche
              en cas d'erreur de saisie en salle. */}
          {hasForm && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("form.answersTitle")}</h2>
              <TournamentFormEditor
                endpoint={`/api/tournaments/${tournamentId}/players/${player.id}/form`}
              />
            </section>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t("playerSheet.penalties", { count: penalties.length })}
              </h2>
              <Button variant="outline" size="sm" onClick={() => setPenaltyOpen((v) => !v)}>
                {t("playerSheet.add")}
              </Button>
            </div>

            {penaltyOpen && (
              <div className="mb-2.5 rounded-xl border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t("playerSheet.penaltyType")}
                </p>
                <div className="mb-2.5 grid grid-cols-2 gap-1.5">
                  {PENALTY_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPenaltyType(type)}
                      aria-pressed={penaltyType === type}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                        penaltyType === type
                          ? PENALTY_TONE[type]
                          : "bg-card hover:bg-accent"
                      )}
                    >
                      {t(`playerSheet.penaltyTypes.${type}`)}
                    </button>
                  ))}
                </div>
                <Input
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  placeholder={t("playerSheet.penaltyReasonPlaceholder")}
                  maxLength={300}
                />
                <div className="mt-2 flex gap-1.5">
                  <Button variant="destructive" size="sm" className="flex-1" onClick={addPenalty} disabled={busy}>
                    {t("playerSheet.applyPenalty")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPenaltyOpen(false)} disabled={busy}>
                    {t("common.cancel")}
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">
                  {t("playerSheet.penaltyHint")}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {penalties.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("playerSheet.noPenalties")}</p>
              ) : (
                penalties.map((penalty) => (
                  <div key={penalty.id} className={cn("rounded-lg border p-2.5", PENALTY_TONE[penalty.type])}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-bold">
                        {t(`playerSheet.penaltyTypes.${penalty.type}`)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePenalty(penalty.id)}
                        disabled={busy}
                        className="text-xs opacity-70 hover:underline disabled:opacity-40"
                      >
                        {t("playerSheet.remove")}
                      </button>
                    </div>
                    {penalty.reason && <p className="mt-0.5 text-[13px]">{penalty.reason}</p>}
                    <p className="mt-1 font-mono text-[11px] opacity-70">
                      {penalty.roundNumber
                        ? `${t("common.roundN", { number: penalty.roundNumber })} · `
                        : ""}
                      {DateTime.fromISO(
                        typeof penalty.createdAt === "string"
                          ? penalty.createdAt
                          : new Date(penalty.createdAt).toISOString()
                      ).toFormat("dd/MM HH:mm")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          {feats.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {t("feats.title", { count: featAwards.length })}
                </h2>
                <FeatAwardPicker
                  feats={feats}
                  awardedCounts={awardedCounts}
                  disabled={busy}
                  onAward={awardFeat}
                />
              </div>
              <p className="mb-2.5 mt-0.5 text-xs text-muted-foreground">{t("feats.sheetHint")}</p>
              {featAwards.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{t("feats.none")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {featAwards.map((awardEntry) => {
                    const catalogFeat = featsById.get(awardEntry.featId);
                    return (
                      <div
                        key={awardEntry.id}
                        className="rounded-lg border bg-muted/40 p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] leading-snug">
                            <Trophy className="mr-1 inline size-3.5 text-amber-500" />
                            {catalogFeat?.title ?? t("feats.unknown")}
                            {catalogFeat && (
                              <span className="ml-1 text-muted-foreground">
                                {t("feats.points", { points: catalogFeat.points })}
                              </span>
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeFeatAward(awardEntry.id)}
                            disabled={busy}
                            aria-label={t("feats.removeAria")}
                            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {awardEntry.matchId ? `${t("feats.inMatch")} · ` : ""}
                          {awardEntry.roundNumber
                            ? `${t("common.roundN", { number: awardEntry.roundNumber })} · `
                            : ""}
                          {DateTime.fromISO(awardEntry.createdAt).toFormat("dd/MM HH:mm")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">
              {t("playerSheet.notes", { count: notes.length })}
            </h2>
            <p className="mb-2.5 mt-0.5 text-xs text-muted-foreground">{t("playerSheet.notesHint")}</p>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t("playerSheet.notePlaceholder")}
              className="min-h-16"
              maxLength={2000}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={addNote}
              disabled={busy || !noteText.trim()}
            >
              {t("playerSheet.saveNote")}
            </Button>
            <div className="mt-3 flex flex-col gap-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border bg-muted/40 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] leading-snug">{note.content}</p>
                    <button
                      type="button"
                      onClick={() => removeNote(note.id)}
                      disabled={busy}
                      aria-label={t("playerSheet.removeNoteAria")}
                      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {note.roundNumber ? `${t("common.roundN", { number: note.roundNumber })} · ` : ""}
                    {DateTime.fromISO(note.createdAt).toFormat("dd/MM HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
