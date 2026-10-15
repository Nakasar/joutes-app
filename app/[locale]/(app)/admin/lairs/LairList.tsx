"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Lock, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Lair } from "@/lib/types/Lair.ts";
import { Game } from "@/lib/types/Game.ts";
import { deleteLair, refreshEvents } from "./actions.ts";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * L'état de l'agenda d'un lieu, tel que la liste le résume :
 * - `failing` : une source a échoué au dernier tour ;
 * - `help` : le gérant a demandé de l'aide et attend une réponse ;
 * - `ok` : le dernier tour a réussi ;
 * - `pending` : des sources, mais aucun tour encore ;
 * - `manual` : aucune source, les évènements sont saisis à la main.
 */
export type LairAgendaState = "failing" | "help" | "ok" | "pending" | "manual";

export type LairAgendaSummary = {
  state: LairAgendaState;
  /** ISO 8601 du dernier tour. */
  refreshedAt?: string;
  /** Évènements rendus par les sources au dernier tour. */
  found?: number;
  /** Le premier message d'erreur d'une source, s'il y en a un. */
  error?: string;
  sources: number;
};

type Filter = "all" | "attention" | "imported" | "manual";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "attention", label: "À surveiller" },
  { key: "imported", label: "Agenda importé" },
  { key: "manual", label: "Saisie à la main" },
];

const needsAttention = (state: LairAgendaState) => state === "failing" || state === "help";

export function LairList({
  lairs,
  games,
  agendas,
  initialFilter,
}: {
  lairs: Lair[];
  games: Game[];
  agendas: Record<string, LairAgendaSummary>;
  initialFilter: Filter;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [lairToDelete, setLairToDelete] = useState<Lair | null>(null);

  const gameName = (gameId: string) => games.find((g) => g.id === gameId)?.name || gameId;
  const agendaOf = (lair: Lair): LairAgendaSummary => agendas[lair.id] ?? { state: "manual", sources: 0 };

  const needle = query.trim().toLocaleLowerCase("fr");
  const shown = lairs
    .filter((lair) => {
      const state = agendaOf(lair).state;
      if (filter === "attention" && !needsAttention(state)) return false;
      if (filter === "imported" && state === "manual") return false;
      if (filter === "manual" && state !== "manual") return false;
      return !needle || `${lair.name} ${lair.address ?? ""}`.toLocaleLowerCase("fr").includes(needle);
    })
    // Ce qui demande une intervention d'abord, puis l'ordre alphabétique.
    .sort(
      (a, b) =>
        Number(needsAttention(agendaOf(b).state)) - Number(needsAttention(agendaOf(a).state)) ||
        a.name.localeCompare(b.name, "fr")
    );

  const attention = lairs.filter((lair) => needsAttention(agendaOf(lair).state)).length;

  const refresh = (lair: Lair) => {
    setBusyId(lair.id);
    startTransition(async () => {
      const result = await refreshEvents(lair.id);
      setBusyId(null);
      if (result.success) {
        toast.success(result.message || `Agenda de ${lair.name} relu.`);
      } else {
        toast.error(result.error || "L'agenda n'a pas pu être relu.");
      }
      router.refresh();
    });
  };

  const remove = (lair: Lair) => {
    startTransition(async () => {
      const result = await deleteLair(lair.id);
      if (!result.success) {
        toast.error(result.error || "Erreur lors de la suppression du lieu");
        return;
      }
      toast.success(`${lair.name} supprimé.`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {attention > 0 && filter !== "attention" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-950 dark:bg-red-500/10 dark:text-red-100">
          <span className="min-w-60 flex-1">
            <strong>
              {attention} agenda{attention > 1 ? "s" : ""} à surveiller
            </strong>{" "}
            : un import a échoué ou un gérant attend de l&apos;aide.
          </span>
          <Button variant="outline" size="sm" className="h-10" onClick={() => setFilter("attention")}>
            Ne montrer qu&apos;eux
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-11 min-w-64 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Rechercher un lieu</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, ville ou adresse"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div role="group" aria-label="État de l'agenda" className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:border-foreground/40"
              )}
            >
              {label}
              {key === "attention" && attention > 0 ? ` · ${attention}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Le tableau défile dans sa carte plutôt que d'être coupé à la largeur de l'écran. */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-border text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <th className="px-5 py-3">Lieu</th>
              <th className="px-3 py-3">Jeux</th>
              <th className="px-3 py-3">Agenda</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((lair) => {
              const agenda = agendaOf(lair);
              const alert = needsAttention(agenda.state);
              return (
                <tr key={lair.id} className={cn("border-b border-border/60 last:border-b-0", alert && "bg-red-50/60 dark:bg-red-500/5")}>
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/lairs/${lair.id}`} className="flex min-w-0 items-center gap-3">
                      {lair.banner ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lair.banner} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-600 font-bold text-white dark:bg-sky-500">
                          {lair.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 font-semibold hover:underline">
                          {lair.name}
                          {lair.isPrivate && <Lock className="size-3.5 text-muted-foreground" aria-label="Privé" />}
                        </span>
                        {lair.address && <span className="max-w-xs truncate text-[13px] text-muted-foreground">{lair.address}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    {lair.games.length === 0 ? (
                      <span className="text-[13px] text-muted-foreground">Aucun jeu</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {lair.games.map((gameId) => (
                          <span key={gameId} className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
                            {gameName(gameId)}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <AgendaCell agenda={agenda} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex justify-end gap-1.5">
                      {agenda.sources > 0 && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-10"
                          aria-label={`Relire l'agenda de ${lair.name}`}
                          title="Relire l'agenda maintenant"
                          disabled={isPending && busyId === lair.id}
                          onClick={() => refresh(lair)}
                        >
                          <RefreshCw className={cn(busyId === lair.id && "animate-spin")} aria-hidden />
                        </Button>
                      )}
                      <Button asChild variant="secondary" className="h-10">
                        <Link href={`/admin/lairs/${lair.id}`}>Ouvrir</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 text-muted-foreground hover:text-destructive"
                        aria-label={`Supprimer ${lair.name}`}
                        title="Supprimer le lieu"
                        onClick={() => setLairToDelete(lair)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Aucun lieu ne correspond à ces filtres.</p>}
      </div>

      <ConfirmDialog
        open={!!lairToDelete}
        onOpenChange={(open) => {
          if (!open) setLairToDelete(null);
        }}
        title={`Supprimer ${lairToDelete?.name ?? "ce lieu"} ?`}
        description="Le lieu disparaît de l'annuaire, avec son agenda. On ne pourra pas revenir en arrière."
        confirmLabel="Supprimer"
        destructive
        busy={isPending}
        onConfirm={() => {
          if (lairToDelete) remove(lairToDelete);
          setLairToDelete(null);
        }}
      />
    </div>
  );
}

const AGENDA_DOTS: Record<LairAgendaState, string> = {
  failing: "bg-red-600",
  help: "bg-amber-500",
  ok: "bg-emerald-600",
  pending: "bg-slate-400",
  manual: "bg-slate-400",
};

function AgendaCell({ agenda }: { agenda: LairAgendaSummary }) {
  const when = agenda.refreshedAt
    ? DateTime.fromISO(agenda.refreshedAt).setLocale("fr").toRelative()
    : undefined;

  const [label, detail] = (() => {
    switch (agenda.state) {
      case "failing":
        return ["Import en échec", agenda.error ? `${agenda.error}${when ? ` · ${when}` : ""}` : when];
      case "help":
        return ["Le gérant demande de l'aide", when ? `Dernière lecture ${when}` : undefined];
      case "ok":
        return [
          "Importé",
          `${when ? `Lu ${when}` : "Lu"} · ${agenda.found ?? 0} évènement${(agenda.found ?? 0) > 1 ? "s" : ""}`,
        ];
      case "pending":
        return ["Importé", "Pas encore lu"];
      case "manual":
        return ["Saisie à la main", undefined];
    }
  })();

  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className={cn("size-2 shrink-0 rounded-full", AGENDA_DOTS[agenda.state])} aria-hidden />
        {label}
      </span>
      {detail && (
        <span
          className={cn(
            "max-w-xs truncate text-[13px]",
            agenda.state === "failing" ? "font-medium text-red-800 dark:text-red-300" : "text-muted-foreground"
          )}
          title={detail}
        >
          {detail}
        </span>
      )}
    </span>
  );
}
