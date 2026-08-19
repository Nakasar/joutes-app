"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { DateTime } from "luxon";
import { EyeOff, ExternalLink, Flag, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { REPORTABLE_CONTENT_LABELS, ReportGroup } from "@/lib/types/Report.ts";
import { deleteReportedContentAction, ignoreReportedContentAction } from "./actions.ts";

function formatDate(date: Date): string {
  return DateTime.fromJSDate(new Date(date)).setLocale("fr").toLocaleString(DateTime.DATETIME_MED);
}

export default function ReportsList({ groups }: { groups: ReportGroup[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<ReportGroup | null>(null);

  const runAction = (
    group: ReportGroup,
    action: typeof ignoreReportedContentAction | typeof deleteReportedContentAction
  ) => {
    setError(null);
    setPendingKey(`${group.contentType}:${group.contentId}`);

    startTransition(async () => {
      const result = await action({ contentType: group.contentType, contentId: group.contentId });
      setPendingKey(null);

      if (!result.success) {
        setError(result.error ?? "Erreur lors du traitement du signalement");
        return;
      }

      if (result.error) {
        setError(result.error);
      }

      router.refresh();
    });
  };

  if (groups.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-md p-8 text-center text-muted-foreground">
        Aucun contenu signalé pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
          {error}
        </p>
      )}

      {groups.map((group) => {
        const key = `${group.contentType}:${group.contentId}`;
        const busy = isPending && pendingKey === key;

        return (
          <div key={key} className="bg-card rounded-lg shadow-md p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{REPORTABLE_CONTENT_LABELS[group.contentType]}</Badge>
                  <Badge variant="destructive" className="gap-1">
                    <Flag className="h-3 w-3" />
                    {group.count === 1 ? "1 signalement" : `${group.count} signalements`}
                  </Badge>
                  {!group.content.exists && <Badge variant="outline">Contenu introuvable</Badge>}
                </div>

                <h2 className="text-lg font-semibold text-foreground break-words">
                  {group.content.title}
                </h2>

                {group.content.excerpt && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {group.content.excerpt}
                  </p>
                )}

                {group.content.url && (
                  <Link
                    href={group.content.url}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Voir le contenu
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction(group, ignoreReportedContentAction)}
                >
                  <EyeOff className="h-4 w-4 mr-2" />
                  Ignorer
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => setGroupToDelete(group)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </Button>
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Dernier signalement le {formatDate(group.lastReportedAt)}
              </p>
              <ul className="space-y-1">
                {group.reasons.map((report, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {report.reporter?.label ?? "Utilisateur inconnu"}
                    </span>{" "}
                    <span className="text-xs">({formatDate(report.createdAt)})</span>
                    {report.reason ? ` — ${report.reason}` : " — aucun motif précisé"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={!!groupToDelete}
        onOpenChange={(open) => {
          if (!open) setGroupToDelete(null);
        }}
        title="Supprimer le contenu signalé"
        description={
          groupToDelete?.contentType === "user"
            ? "La biographie du profil sera remplacée par « Contenu modéré » et les signalements seront clos. Cette action est irréversible."
            : "Le contenu sera définitivement supprimé et les signalements seront clos. Cette action est irréversible."
        }
        confirmLabel="Supprimer"
        destructive
        busy={isPending}
        onConfirm={() => {
          if (!groupToDelete) return;
          runAction(groupToDelete, deleteReportedContentAction);
          setGroupToDelete(null);
        }}
      />
    </div>
  );
}
