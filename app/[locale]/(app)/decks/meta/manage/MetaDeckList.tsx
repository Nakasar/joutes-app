"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { MetaDeckEditDialog, type EditableMetaDeck } from "@/components/decks/MetaDeckEditDialog.tsx";
import { tournamentPath } from "@/lib/meta/tournaments.ts";
import { cn } from "@/lib/utils.ts";
import { removeMetaBatchAction, removeMetaDeckAction } from "./actions.ts";

type MetaDeckRow = {
  id: string;
  name: string;
  legendName?: string;
  coverImage?: string;
  creatorName?: string;
  domains: string[];
  visibility: string;
  meta?: { imported: boolean; source: string; eventDate: string; placement?: string; pilot?: string };
};

type Pending = { kind: "deck"; deck: MetaDeckRow } | { kind: "batch"; batchId: string; source: string; count: number };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Les decks qui comptent dans la méta, filtrables par source, et leur retrait. */
export function MetaDeckList({
  decks,
  sources,
  activeSource,
  sourceBatch,
  page,
  totalPages,
  total,
  baseHref,
  metaPath,
  sourceActions,
}: {
  decks: MetaDeckRow[];
  sources: { source: string; decks: number; lastEventDate: string }[];
  activeSource?: string;
  /** Le lot dont viennent tous les decks importés de la source filtrée, compté sur toutes les pages. */
  sourceBatch?: { batchId: string; decks: number };
  page: number;
  totalPages: number;
  total: number;
  baseHref: string;
  /** La page Méta publique du jeu, d'où partent les pages de tournoi. */
  metaPath: string;
  /** Sous le filtre d'une source : ce qu'on peut faire de tout son tournoi. */
  sourceActions?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<EditableMetaDeck | null>(null);
  const [busy, startTransition] = useTransition();

  const hrefFor = (source?: string, targetPage = 1) =>
    `${baseHref}${source ? `&source=${encodeURIComponent(source)}` : ""}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  const confirm = () =>
    startTransition(async () => {
      if (!pending) return;
      if (pending.kind === "deck") {
        const result = await removeMetaDeckAction(pending.deck.id);
        if (!result.ok) toast.error(result.error);
        else toast.success(result.deleted ? "Deck supprimé." : "Le deck ne compte plus dans la méta.");
      } else {
        const result = await removeMetaBatchAction(pending.batchId);
        if (!result.ok) toast.error(result.error);
        else toast.success(`${result.deleted} deck${result.deleted > 1 ? "s" : ""} supprimé${result.deleted > 1 ? "s" : ""}.`);
      }
      setPending(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {sources.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <SourceChip href={hrefFor()} active={!activeSource} label="Toutes" count={sources.reduce((sum, row) => sum + row.decks, 0)} />
          {sources.map((row) => (
            <SourceChip
              key={row.source}
              href={hrefFor(row.source)}
              active={row.source === activeSource}
              label={row.source}
              count={row.decks}
            />
          ))}
        </div>
      )}

      {activeSource && sourceBatch && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">Les {sourceBatch.decks} decks importés de « {activeSource} » viennent du même import.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPending({ kind: "batch", batchId: sourceBatch.batchId, source: activeSource, count: sourceBatch.decks })}
          >
            Annuler cet import
          </Button>
        </div>
      )}

      {activeSource && sourceActions}

      {decks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aucun deck méta pour l&apos;instant. Importez-en depuis l&apos;onglet Importer.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {decks.map((deck) => (
            <li key={deck.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              {deck.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deck.coverImage} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
              ) : (
                <div className="h-12 w-16 shrink-0 rounded-md bg-muted" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/decks/${deck.id}`} className="truncate font-semibold hover:underline">
                  {deck.name}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  {[deck.legendName, deck.creatorName].filter(Boolean).join(" · ")}
                </span>
                {deck.meta && (
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <Link href={tournamentPath(metaPath, deck.meta.source, deck.meta.eventDate)} className="hover:underline">
                      {deck.meta.source}
                    </Link>
                    <span>· {dateFormat.format(new Date(deck.meta.eventDate))}</span>
                    {deck.meta.placement && <span>· {deck.meta.placement}</span>}
                    <span
                      className={cn(
                        "rounded-full px-2 py-px font-medium",
                        deck.meta.imported ? "bg-secondary text-secondary-foreground" : "bg-primary/15 text-primary"
                      )}
                    >
                      {deck.meta.imported ? "importé" : "deck de joueur"}
                    </span>
                    {deck.visibility !== "public" && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-px font-medium text-amber-800 dark:text-amber-300">
                        plus public : hors statistiques
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="-mr-2 flex shrink-0">
                {deck.meta && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Modifier ${deck.name}`}
                    onClick={() => deck.meta && setEditing({ id: deck.id, name: deck.name, meta: deck.meta })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={deck.meta?.imported ? `Supprimer ${deck.name}` : `Retirer ${deck.name} de la méta`}
                  onClick={() => setPending({ kind: "deck", deck })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} sur {totalPages} · {total} decks
          </span>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
              <Link href={hrefFor(activeSource, page - 1)} aria-disabled={page <= 1}>
                Précédente
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={cn(page >= totalPages && "pointer-events-none opacity-50")}>
              <Link href={hrefFor(activeSource, page + 1)} aria-disabled={page >= totalPages}>
                Suivante
              </Link>
            </Button>
          </div>
        </nav>
      )}

      <MetaDeckEditDialog deck={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === "batch"
            ? `Annuler l'import « ${pending.source} » ?`
            : pending?.deck.meta?.imported
              ? "Supprimer ce deck importé ?"
              : "Retirer ce deck de la méta ?"
        }
        description={
          pending?.kind === "batch"
            ? `Les ${pending.count} decks importés de ce lot seront supprimés.`
            : pending?.deck.meta?.imported
              ? `« ${pending.deck.name} » sera supprimé et sortira des statistiques.`
              : pending
                ? `« ${pending.deck.name} » reste le deck de son joueur, mais ne compte plus dans les statistiques.`
                : undefined
        }
        confirmLabel={pending?.kind === "deck" && !pending.deck.meta?.imported ? "Retirer" : "Supprimer"}
        destructive
        busy={busy}
        onConfirm={confirm}
      />
    </div>
  );
}

function SourceChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted"
      )}
    >
      {label}
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
    </Link>
  );
}
