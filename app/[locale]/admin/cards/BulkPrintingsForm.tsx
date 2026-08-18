"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buildPrintingId } from "@/lib/constants/card-ids";
import { parseCardIdList } from "@/lib/cards/bulk-printings";
import { addPrintingToGameCards } from "./actions";
import type { BulkPrintingOutcome } from "@/lib/db/cards";

const inputClass =
  "w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent";

type Props = {
  gameId: string;
  gameName: string;
};

/** Une catégorie du compte rendu, dépliable pour voir les identifiants concernés. */
function OutcomeGroup({
  singular,
  plural,
  tone,
  ids,
}: {
  singular: string;
  plural: string;
  tone: "success" | "neutral" | "warning";
  ids: string[];
}) {
  const [open, setOpen] = useState(false);

  if (ids.length === 0) {
    return null;
  }

  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className={`font-medium ${toneClass}`}>{ids.length}</span>
        <span className="text-foreground">{ids.length === 1 ? singular : plural}</span>
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <p className="mt-1 max-h-40 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
          {ids.join(", ")}
        </p>
      )}
    </div>
  );
}

/**
 * Applique une même variante d'impression à une liste de cartes désignées par
 * leur identifiant. Sert aux tirages qui sortent sur tout un ensemble de cartes
 * — promo pack, pré-release — que le formulaire carte par carte rendrait
 * interminables.
 */
export default function BulkPrintingsForm({ gameId, gameName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [cardIds, setCardIds] = useState("");
  const [name, setName] = useState("");
  const [foil, setFoil] = useState(false);
  const [image, setImage] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BulkPrintingOutcome | null>(null);

  const ids = useMemo(() => parseCardIdList(cardIds), [cardIds]);
  const trimmedName = name.trim();
  const canSubmit = ids.length > 0 && trimmedName.length > 0 && !isPending;

  const apply = () => {
    setConfirming(false);
    setError(null);
    setWarning(null);
    setOutcome(null);

    startTransition(async () => {
      const result = await addPrintingToGameCards(gameId, {
        cardIds,
        printing: { name: trimmedName, foil, image: image.trim() },
        replaceExisting,
      });

      if (!result.success) {
        setError(result.error ?? "L'ajout de la variante a échoué.");
        return;
      }

      setOutcome(result.outcome ?? null);
      setWarning(result.warning ?? null);
      // La liste des cartes récentes et la carte ouverte doivent refléter les
      // variantes qui viennent d'être écrites.
      router.refresh();
    });
  };

  return (
    <div className="bg-card rounded-lg shadow-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
      >
        <span>
          <span className="block text-lg font-semibold text-foreground">Ajouter une variante en masse</span>
          <span className="block text-sm text-muted-foreground">
            Applique une même variante d&apos;impression à une liste de cartes de {gameName}.
          </span>
        </span>
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Identifiants des cartes</label>
            <textarea
              value={cardIds}
              onChange={(e) => setCardIds(e.target.value)}
              rows={6}
              placeholder={"SFD125\nSFD126, SFD127"}
              className={`${inputClass} font-mono text-sm`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Un par ligne, ou séparés par des virgules ou des espaces. Les doublons sont retirés.{" "}
              {ids.length > 0 && (
                <span className="text-foreground">
                  {ids.length} identifiant{ids.length === 1 ? "" : "s"} reconnu{ids.length === 1 ? "" : "s"}.
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nom de la variante</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Promo Pack"
                className={inputClass}
              />
              {trimmedName && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  identifiant : {buildPrintingId(trimmedName)}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Image (facultatif)</label>
              <input
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://…"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Sans image, la variante reprend celle de chaque carte.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
              Variante foil
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Remplacer la variante si elle existe déjà
            </label>
            <p className="text-xs text-muted-foreground">
              Sans cette option, une carte qui porte déjà cette variante est laissée telle quelle. Le remplacement
              conserve l&apos;identifiant existant, pour ne pas détacher les exemplaires de collection qui s&apos;y
              réfèrent.
            </p>
          </div>

          <Button type="button" onClick={() => setConfirming(true)} disabled={!canSubmit}>
            {isPending ? "Application…" : "Appliquer aux cartes listées"}
          </Button>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {warning && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              {warning}
            </p>
          )}

          {outcome && (
            <div className="space-y-2 rounded-lg border p-3">
              <OutcomeGroup
                singular="variante ajoutée"
                plural="variantes ajoutées"
                tone="success"
                ids={outcome.added}
              />
              <OutcomeGroup
                singular="variante remplacée"
                plural="variantes remplacées"
                tone="success"
                ids={outcome.replaced}
              />
              <OutcomeGroup
                singular="carte la portait déjà, laissée telle quelle"
                plural="cartes la portaient déjà, laissées telles quelles"
                tone="neutral"
                ids={outcome.skipped}
              />
              <OutcomeGroup
                singular="carte au maximum de variantes"
                plural="cartes au maximum de variantes"
                tone="warning"
                ids={outcome.limitReached}
              />
              <OutcomeGroup
                singular="identifiant introuvable pour ce jeu"
                plural="identifiants introuvables pour ce jeu"
                tone="warning"
                ids={outcome.notFound}
              />
              {outcome.added.length === 0 &&
                outcome.replaced.length === 0 &&
                outcome.skipped.length === 0 &&
                outcome.limitReached.length === 0 &&
                outcome.notFound.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucune carte traitée.</p>
                )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Appliquer la variante ?"
        description={`« ${trimmedName} » sera ${
          replaceExisting ? "ajoutée ou remplacée" : "ajoutée"
        } sur ${ids.length} carte${ids.length === 1 ? "" : "s"} de ${gameName}.`}
        confirmLabel="Appliquer"
        busy={isPending}
        onConfirm={apply}
      />
    </div>
  );
}
