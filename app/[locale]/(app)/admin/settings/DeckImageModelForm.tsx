"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useRouter } from "@/i18n/navigation.ts";
import { MODEL_ID_MAX_LENGTH } from "@/lib/models/model-id.ts";
import {
  resetDeckImageModelAction,
  saveDeckImageModelAction,
  testDeckImageModelAction,
  type DeckImageModelState,
  type TestResult,
} from "./actions.ts";

export function DeckImageModelForm({
  initialState,
  defaultModelId,
}: {
  initialState: DeckImageModelState;
  defaultModelId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState(initialState.modelId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ modelId: string; result: TestResult } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const isDirty = draft.trim() !== state.modelId;
  const isBusy = isSaving || isTesting;

  // Un verdict ne vaut que pour la chaîne sur laquelle il a été rendu : dès que
  // la saisie s'en écarte, il disparaît plutôt que de paraître approuver une
  // valeur que personne n'a essayée.
  const verdict = test && test.modelId === draft.trim() ? test.result : null;

  function apply(next: DeckImageModelState) {
    setState(next);
    setDraft(next.modelId);
    setError(null);
    setSaved(true);
    // Le serveur a invalidé sa charge : sans ça, le cache de navigation
    // resservirait l'ancienne au premier retour arrière.
    router.refresh();
  }

  function save() {
    startSaving(async () => {
      const result = await saveDeckImageModelAction(draft);

      if (result.ok) {
        apply(result.state);
      } else {
        setSaved(false);
        setError(result.error);
      }
    });
  }

  function reset() {
    startSaving(async () => {
      const result = await resetDeckImageModelAction();

      if (result.ok) {
        apply(result.state);
      } else {
        setSaved(false);
        setError(result.error);
      }
    });
  }

  function runTest() {
    const tested = draft.trim();

    startTesting(async () => {
      setError(null);
      setTest({ modelId: tested, result: await testDeckImageModelAction(tested) });
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="deck-image-model">Identifiant du modèle</Label>
        <Input
          id="deck-image-model"
          value={draft}
          maxLength={MODEL_ID_MAX_LENGTH}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
            setError(null);
          }}
          placeholder={defaultModelId}
          className="font-mono"
        />
        <p className="text-sm text-muted-foreground">
          Envoyé tel quel au fournisseur. Rien ne vérifie qu&apos;il existe avant le premier
          appel : le bouton « Tester » est là pour ça.
        </p>
      </div>

      <div className="flex flex-wrap flex-row items-center gap-3">
        <Button onClick={save} disabled={isBusy || !isDirty || !draft.trim()}>
          {isSaving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button variant="outline" onClick={runTest} disabled={isBusy || !draft.trim()}>
          {isTesting ? "Test en cours…" : "Tester"}
        </Button>
        {state.isCustom && (
          <Button variant="ghost" onClick={reset} disabled={isBusy}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Revenir au modèle du code
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {saved && !isDirty && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          {state.isCustom
            ? "Réglage enregistré. La prochaine lecture de photo l'utilise."
            : "Réglage effacé. Les lectures repartent sur le modèle du code."}
        </p>
      )}

      {verdict && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            verdict.ok
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-red-500/40 bg-red-500/5"
          }`}
          role="status"
        >
          <p className="flex items-center gap-2 font-medium">
            {verdict.ok ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Le modèle a lu l&apos;image de test.
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                Le test a échoué.
              </>
            )}
          </p>
          <p className="mt-1 break-words text-muted-foreground">
            {verdict.ok ? verdict.reply : verdict.error}
          </p>
        </div>
      )}

      <dl className="grid gap-1 border-t border-border pt-4 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Modèle actif :</dt>
          <dd className="font-mono">{state.modelId}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Origine :</dt>
          <dd>{state.isCustom ? "réglage enregistré" : "valeur par défaut du code"}</dd>
        </div>
        {state.updatedAt && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Modifié le :</dt>
            <dd>
              {DateTime.fromISO(state.updatedAt)
                .setLocale("fr")
                .toLocaleString(DateTime.DATETIME_MED)}
              {state.updatedBy ? ` par ${state.updatedBy}` : ""}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
