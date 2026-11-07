"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { undoBatch } from "./undo-batch.ts";

type QuickAddSet = {
  setCode: string;
  name?: string;
  masterTotal: number;
  gameTotal: number;
  rarities: string[];
};

type Plan = { copies: number; cards: number; unchanged: number; batchId?: string };

const LANGUAGES = ["EN", "FR", "IT", "ZH", "JA", "KO"] as const;
/** Langue laissée vide : l'exemplaire n'en déclare aucune, comme à l'import d'un fichier qui ne la dit pas. */
const NO_LANGUAGE = "none";
const MAX_COPIES = 20;
const PREVIEW_DELAY_MS = 250;

/**
 * Ajout rapide d'une extension : N exemplaires de chacune de ses cartes.
 *
 * Par défaut, chaque carte reçoit N exemplaires de plus (un display ouvert, un
 * lot acheté) ; « compléter jusqu'à N » n'ajoute que ce qui manque. Ce que fera
 * l'ajout est recalculé par le serveur à chaque réglage, avant d'écrire quoi
 * que ce soit, et l'ajout fait s'annule d'un clic.
 */
export default function AddSetDialog({
  gameSlug,
  initialSetCode,
  catalogLanguage,
  onAdded,
}: {
  gameSlug: string;
  /** Extension filtrée à l'écran, proposée d'office. */
  initialSetCode?: string;
  /** Langue du catalogue du jeu (`en`), proposée d'office pour les exemplaires. */
  catalogLanguage?: string;
  /** Appelé après un ajout (ou son annulation), pour recharger la page courante. */
  onAdded: () => void;
}) {
  const t = useTranslations("Collection.quickAdd");
  const tGames = useTranslations("Games");

  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState<QuickAddSet[] | null>(null);
  const [setsError, setSetsError] = useState(false);
  const [setCode, setSetCode] = useState(initialSetCode ?? "");
  const [copies, setCopies] = useState(1);
  const [mode, setMode] = useState<"add" | "fill">("add");
  const [scope, setScope] = useState<"game" | "master">("game");
  const [excluded, setExcluded] = useState<string[]>([]);
  const defaultLanguage = LANGUAGES.find((code) => code.toLowerCase() === catalogLanguage?.toLowerCase());
  const [language, setLanguage] = useState<string>(defaultLanguage ?? NO_LANGUAGE);
  const [foil, setFoil] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || sets) return;
    let cancelled = false;
    fetch(`/api/collection/games/${gameSlug}/quick-add`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { sets: QuickAddSet[] }) => {
        if (cancelled) return;
        setSets(data.sets);
        // L'extension filtrée à l'écran est proposée ; sinon on laisse choisir.
        setSetCode((current) => (data.sets.some((set) => set.setCode === current) ? current : ""));
      })
      .catch(() => !cancelled && setSetsError(true));
    setSetsError(false);
    return () => {
      cancelled = true;
    };
  }, [open, sets, gameSlug]);

  const selected = sets?.find((set) => set.setCode === setCode);
  const rarities = useMemo(
    () => (selected ? selected.rarities.filter((rarity) => !excluded.includes(rarity)) : []),
    [selected, excluded]
  );

  const request = useMemo(
    () =>
      selected
        ? {
            setCode: selected.setCode,
            copies,
            mode,
            scope,
            // Toutes cochées : on n'envoie rien, pour qu'une rareté absente de
            // la liste (une carte sans rareté) ne soit pas écartée pour autant.
            ...(excluded.some((rarity) => selected.rarities.includes(rarity)) ? { rarities } : {}),
            ...(language !== NO_LANGUAGE ? { language } : {}),
            foil,
          }
        : null,
    [selected, copies, mode, scope, excluded, rarities, language, foil]
  );

  useEffect(() => {
    if (!open || !request) return;
    const controller = new AbortController();
    setPlanning(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/collection/games/${gameSlug}/quick-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, dryRun: true }),
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: Plan | null) => !controller.signal.aborted && setPlan(data))
        .catch(() => {})
        .finally(() => !controller.signal.aborted && setPlanning(false));
    }, PREVIEW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setPlanning(false);
    };
  }, [open, request, gameSlug]);

  const handleSubmit = async () => {
    if (!request || !selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/collection/games/${gameSlug}/quick-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(t("error"), { description: data.error });
        return;
      }
      const result = data as Plan;
      const setLabel = selected.name ?? selected.setCode;
      const batchId = result.batchId;
      toast.success(t("done", { count: result.copies, set: setLabel }), {
        ...(batchId
          ? {
              action: {
                label: t("undo"),
                onClick: () => void undoBatch(batchId, (count) => t("undone", { count }), t("undoError")).then(onAdded),
              },
            }
          : {}),
      });
      setOpen(false);
      onAdded();
    } catch {
      toast.error(t("error"));
    } finally {
      setBusy(false);
    }
  };

  const option = (
    name: string,
    checked: boolean,
    onSelect: () => void,
    title: string,
    detail: string
  ) => (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
        checked ? "border-primary bg-primary/5" : "hover:bg-muted/40"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("action")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          {setsError ? (
            <p className="text-sm text-destructive">{t("loadError")}</p>
          ) : !sets ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="space-y-2">
                  <Label htmlFor="quick-add-set">{t("set")}</Label>
                  <Select value={setCode} onValueChange={(value) => { setSetCode(value); setExcluded([]); }}>
                    <SelectTrigger id="quick-add-set">
                      <SelectValue placeholder={t("setPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {sets.map((set) => (
                        <SelectItem key={set.setCode} value={set.setCode}>
                          <span className="font-mono text-xs">{set.setCode}</span>
                          {set.name ? ` · ${set.name}` : ""}
                          <span className="text-muted-foreground"> · {t("setSize", { count: set.masterTotal })}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-add-copies">{t("copies")}</Label>
                  <div className="flex h-9 items-center rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={t("less")}
                      onClick={() => setCopies((value) => Math.max(1, value - 1))}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <input
                      id="quick-add-copies"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_COPIES}
                      value={copies}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        if (Number.isFinite(value)) setCopies(Math.min(MAX_COPIES, Math.max(1, value)));
                      }}
                      className="w-full min-w-0 bg-transparent text-center text-sm font-semibold [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={t("more")}
                      onClick={() => setCopies((value) => Math.min(MAX_COPIES, value + 1))}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">{t("mode")}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {option("quick-add-mode", mode === "add", () => setMode("add"), t("modeAdd", { count: copies }), t("modeAddDetail"))}
                  {option("quick-add-mode", mode === "fill", () => setMode("fill"), t("modeFill", { count: copies }), t("modeFillDetail", { count: copies }))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">{t("scope")}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {option(
                    "quick-add-scope",
                    scope === "game",
                    () => setScope("game"),
                    t("scopeGame", { count: selected?.gameTotal ?? 0 }),
                    t("scopeGameDetail")
                  )}
                  {option(
                    "quick-add-scope",
                    scope === "master",
                    () => setScope("master"),
                    t("scopeMaster", { count: selected?.masterTotal ?? 0 }),
                    t("scopeMasterDetail")
                  )}
                </div>
                {selected && selected.rarities.length > 1 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">{t("rarities")}</span>
                    {selected.rarities.map((rarity) => {
                      const active = !excluded.includes(rarity);
                      return (
                        <button
                          key={rarity}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setExcluded((current) =>
                              active ? [...current, rarity] : current.filter((value) => value !== rarity)
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                          }`}
                        >
                          {active ? <Check className="h-3 w-3" /> : null}
                          {rarity}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-add-language">{t("language")}</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="quick-add-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LANGUAGE}>{t("noLanguage")}</SelectItem>
                      {LANGUAGES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {tGames(`cards.collection.languages.${code.toLowerCase()}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">{t("finish")}</span>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input type="checkbox" checked={foil} onChange={(event) => setFoil(event.target.checked)} className="size-4 accent-primary" />
                    {t("foil")}
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 rounded-lg bg-muted px-4 py-3" aria-live="polite">
                <div>
                  <p className="text-xl font-bold tabular-nums">{plan?.copies ?? "–"}</p>
                  <p className="text-xs text-muted-foreground">{t("previewCopies")}</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{plan ? plan.cards - plan.unchanged : "–"}</p>
                  <p className="text-xs text-muted-foreground">{t("previewCards")}</p>
                </div>
                {mode === "fill" ? (
                  <div>
                    <p className="text-xl font-bold tabular-nums text-emerald-500">{plan?.unchanged ?? "–"}</p>
                    <p className="text-xs text-muted-foreground">{t("previewUnchanged", { count: copies })}</p>
                  </div>
                ) : null}
                {planning ? <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" /> : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleSubmit} disabled={busy || !plan || plan.copies === 0} className="gap-2">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {t("submit", { count: plan?.copies ?? 0 })}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
