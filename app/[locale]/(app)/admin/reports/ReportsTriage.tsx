"use client";

import { useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { AlertTriangle, Check, ExternalLink, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { REPORTABLE_CONTENT_LABELS, type ReportGroup, type ReportableContentType } from "@/lib/types/Report.ts";
import { cn } from "@/lib/utils.ts";
import { reportTone } from "../_components/tones.ts";
import { deleteReportedContentAction, ignoreReportedContentAction, restoreIgnoredReportsAction } from "./actions.ts";

const keyOf = (group: Pick<ReportGroup, "contentType" | "contentId">) => `${group.contentType}:${group.contentId}`;

function formatDate(date: Date): string {
  return DateTime.fromJSDate(new Date(date)).setLocale("fr").toFormat("d LLL, HH:mm");
}

function relative(date: Date): string {
  return DateTime.fromJSDate(new Date(date)).setLocale("fr").toRelative() ?? "";
}

/** Ce que « Supprimer » fera, dit avant de le faire. */
function deletion(type: ReportableContentType) {
  return type === "user"
    ? {
        label: "Modérer la biographie",
        question: "Modérer la biographie de ce profil ?",
        effect: "Elle sera remplacée par « Contenu modéré ». Le compte reste actif.",
      }
    : {
        label: "Supprimer le contenu",
        question: "Supprimer ce contenu ?",
        effect: "Il sera définitivement supprimé et ses signalements clos. On ne pourra pas revenir en arrière.",
      };
}

/**
 * Le tri des signalements : la file à gauche, les plus signalés d'abord, et le
 * contenu choisi à droite avec ses motifs et les deux décisions possibles.
 *
 * Une décision retire aussitôt le contenu de la file et passe au suivant ;
 * « Le contenu est correct » s'annule depuis la notification qui suit.
 */
export default function ReportsTriage({ groups }: { groups: ReportGroup[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportableContentType | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const sorted = useMemo(
    () =>
      [...groups].sort(
        (a, b) => b.count - a.count || new Date(a.firstReportedAt).getTime() - new Date(b.firstReportedAt).getTime()
      ),
    [groups]
  );
  const open = sorted.filter((group) => !handled.has(keyOf(group)));
  const types = [...new Set(open.map((group) => group.contentType))];
  const visible = open.filter((group) => filter === "all" || group.contentType === filter);
  const current = visible.find((group) => keyOf(group) === selectedKey) ?? visible[0];

  const select = (key: string | null) => {
    setSelectedKey(key);
    setConfirming(false);
  };

  /** Le contenu qui prendra la place de celui qu'on vient de traiter. */
  const nextKeyAfter = (key: string) => {
    const index = visible.findIndex((group) => keyOf(group) === key);
    const rest = visible.filter((group) => keyOf(group) !== key);
    const next = rest[index] ?? rest[0];
    return next ? keyOf(next) : null;
  };

  const markHandled = (key: string, done: boolean) =>
    setHandled((previous) => {
      const next = new Set(previous);
      if (done) next.add(key);
      else next.delete(key);
      return next;
    });

  const ignore = (group: ReportGroup) => {
    const key = keyOf(group);
    const input = { contentType: group.contentType, contentId: group.contentId };
    setBusyKey(key);
    startTransition(async () => {
      const result = await ignoreReportedContentAction(input);
      setBusyKey(null);
      if (!result.success) {
        toast.error(result.error ?? "Le signalement n'a pas pu être fermé.");
        return;
      }
      markHandled(key, true);
      select(nextKeyAfter(key));
      toast(`Signalement fermé pour « ${group.content.title} ».`, {
        action: result.ignoredAt
          ? {
              label: "Annuler",
              onClick: () => {
                startTransition(async () => {
                  const restored = await restoreIgnoredReportsAction({ ...input, ignoredAt: result.ignoredAt! });
                  if (!restored.success) {
                    toast.error(restored.error ?? "Le signalement n'a pas pu être rouvert.");
                    return;
                  }
                  markHandled(key, false);
                  select(key);
                  router.refresh();
                });
              },
            }
          : undefined,
      });
      router.refresh();
    });
  };

  const remove = (group: ReportGroup) => {
    const key = keyOf(group);
    setBusyKey(key);
    startTransition(async () => {
      const result = await deleteReportedContentAction({ contentType: group.contentType, contentId: group.contentId });
      setBusyKey(null);
      setConfirming(false);
      if (!result.success) {
        toast.error(result.error ?? "Le contenu n'a pas pu être supprimé.");
        return;
      }
      markHandled(key, true);
      select(nextKeyAfter(key));
      toast.success(result.error ?? (group.contentType === "user" ? "Biographie modérée." : "Contenu supprimé."));
      router.refresh();
    });
  };

  if (open.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
          <Check className="size-7" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold">Tout est traité</h2>
        <p className="max-w-md text-[15px] text-muted-foreground">
          Plus aucun signalement en attente. Un nouveau signalement fera revenir le compteur dans le menu.
        </p>
        <Button asChild variant="outline" className="mt-2 h-11">
          <Link href="/admin">Revenir à l&apos;accueil</Link>
        </Button>
      </div>
    );
  }

  const busy = current ? busyKey === keyOf(current) : false;
  const remover = current ? deletion(current.contentType) : null;

  return (
    <div className="flex flex-col gap-5">
      {types.length > 1 && (
        <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-1.5">
          {(["all", ...types] as const).map((type) => {
            const count = type === "all" ? open.length : open.filter((group) => group.contentType === type).length;
            const active = filter === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFilter(type);
                  select(null);
                }}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:border-foreground/40"
                )}
              >
                {type === "all" ? "Tout" : REPORTABLE_CONTENT_LABELS[type]} · {count}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section aria-label="File d'attente" className="flex flex-col gap-2 lg:w-80 lg:shrink-0">
          {visible.map((group) => {
            const key = keyOf(group);
            const active = current && keyOf(current) === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => select(key)}
                className={cn(
                  "flex w-full flex-col items-start gap-2 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors",
                  active
                    ? "border-sky-600 bg-card shadow-sm dark:border-sky-400"
                    : "border-transparent bg-card/60 ring-1 ring-border ring-inset hover:bg-card"
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", reportTone(group.contentType))}>
                    {REPORTABLE_CONTENT_LABELS[group.contentType]}
                  </span>
                  <span className="text-xs text-muted-foreground">{relative(group.firstReportedAt)}</span>
                </span>
                <span className="line-clamp-2 text-[15px] font-semibold">{group.content.title}</span>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                  <Flag className="size-3.5" aria-hidden />
                  {group.count === 1 ? "1 signalement" : `${group.count} signalements`}
                </span>
              </button>
            );
          })}
        </section>

        {current && remover && (
          <section aria-label="Contenu sélectionné" className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-col gap-2.5 border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", reportTone(current.contentType))}>
                  {REPORTABLE_CONTENT_LABELS[current.contentType]}
                </span>
                {current.content.url && (
                  <Link
                    href={current.content.url}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                  >
                    Voir sur le site
                    <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>
              <h2 className="text-xl font-bold break-words">{current.content.title}</h2>
              {!current.content.exists && (
                <p className="text-sm text-muted-foreground">
                  Ce contenu n&apos;existe plus : le supprimer clôt simplement ses signalements.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-6 px-6 py-5">
              {current.content.excerpt && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Le contenu signalé</h3>
                  <blockquote className="rounded-xl bg-muted/70 px-4 py-3.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                    {current.content.excerpt}
                  </blockquote>
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {current.count === 1 ? "1 signalement" : `${current.count} signalements`}
                </h3>
                <ul className="flex flex-col gap-3">
                  {current.reasons.map((report, index) => {
                    const label = report.reporter?.label ?? "Utilisateur inconnu";
                    return (
                      <li key={index} className="flex items-start gap-3">
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                          aria-hidden
                        >
                          {label.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[13px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{label}</span> · {formatDate(report.createdAt)}
                          </span>
                          <span className="text-[15px]">{report.reason || "Aucun motif précisé."}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-6 py-4">
              {confirming ? (
                <div className="flex flex-col gap-2.5 rounded-xl bg-red-50 p-4 dark:bg-red-500/10">
                  <span className="flex items-center gap-2 font-semibold text-red-900 dark:text-red-200">
                    <AlertTriangle className="size-4" aria-hidden />
                    {remover.question}
                  </span>
                  <span className="text-sm text-red-900/90 dark:text-red-200/90">{remover.effect}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" className="h-11" disabled={busy} onClick={() => remove(current)}>
                      Oui, {remover.label.toLowerCase()}
                    </Button>
                    <Button variant="outline" className="h-11" disabled={busy} onClick={() => setConfirming(false)}>
                      Garder le contenu
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" className="h-11" disabled={busy} onClick={() => ignore(current)}>
                      <Check aria-hidden />
                      Le contenu est correct
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 border-red-300 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
                      disabled={busy}
                      onClick={() => setConfirming(true)}
                    >
                      <Trash2 aria-hidden />
                      {remover.label}
                    </Button>
                    {visible.length > 1 && (
                      <Button
                        variant="ghost"
                        className="ml-auto h-11 text-sky-700 dark:text-sky-300"
                        onClick={() => select(nextKeyAfter(keyOf(current)))}
                      >
                        Passer au suivant →
                      </Button>
                    )}
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    « Le contenu est correct » ferme le signalement ; il reviendra si quelqu&apos;un signale à nouveau ce
                    contenu.
                  </span>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
