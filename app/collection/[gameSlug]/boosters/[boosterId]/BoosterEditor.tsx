"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Search,
  Plus,
  X,
  Loader2,
  Package,
  Info,
  Sparkles,
  Library,
  CheckCircle2,
  Undo2,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  NotebookPen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Booster, BoosterCard } from "@/lib/types/booster";
import { getBoosterTypeOptions, normalizeBoosterType } from "@/lib/constants/booster-types";
import { BOOSTER_NOTE_MAX_LENGTH } from "@/lib/constants/boosters";
import { parseCardSearch } from "@/lib/cards/search-query";
import { useBoosterTypeLabel } from "../useBoosterTypeLabel";

const LANG_LABELS: Record<string, string> = {
  en: "🇬🇧 EN", fr: "🇫🇷 FR", it: "🇮🇹 IT", de: "🇩🇪 DE",
  es: "🇪🇸 ES", ja: "🇯🇵 JA", ko: "🇰🇷 KO", zh: "🇨🇳 ZH",
};
const langLabel = (code: string) => LANG_LABELS[code.toLowerCase()] ?? code.toUpperCase();

type SearchCard = BoosterCard;

const ALL = "all";

type SortKey = "default" | "name" | "collectorNumber" | "type";
type SortDirection = "asc" | "desc";

const SORT_KEYS: SortKey[] = ["default", "name", "collectorNumber", "type"];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Comparateur du tri courant, appliqué sur des cartes déjà indexées par leur position d'origine. */
function compareCards(a: BoosterCard, b: BoosterCard, key: SortKey): number {
  switch (key) {
    case "name":
      return collator.compare(a.name, b.name);
    case "collectorNumber":
      return collator.compare(a.collectorNumber ?? "", b.collectorNumber ?? "");
    case "type":
      return collator.compare(a.type ?? "", b.type ?? "");
    default:
      return 0;
  }
}

type Props = {
  gameSlug: string;
  gameName: string;
  initialBooster: Booster;
};

export default function BoosterEditor({ gameSlug, gameName, initialBooster }: Props) {
  const t = useTranslations("Collection");
  const router = useRouter();
  const booster = initialBooster;
  const boosterTypeLabel = useBoosterTypeLabel();

  const [boosterCards, setBoosterCards] = useState<BoosterCard[]>(initialBooster.cards ?? []);
  const [rawQuery, setRawQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState(initialBooster.setCode);
  const [results, setResults] = useState<SearchCard[]>([]);
  const [resultSetCodes, setResultSetCodes] = useState<string[]>([initialBooster.setCode]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [busyAddId, setBusyAddId] = useState<string | null>(null);
  const [busyRemoveId, setBusyRemoveId] = useState<string | null>(null);
  const [busyFoilId, setBusyFoilId] = useState<string | null>(null);
  const [creatingSibling, setCreatingSibling] = useState(false);
  const [addedToCollection, setAddedToCollection] = useState(initialBooster.addedToCollection ?? false);
  const [busyCollection, setBusyCollection] = useState(false);
  const [boosterType, setBoosterType] = useState(normalizeBoosterType(initialBooster.type));
  const [savingBoosterType, setSavingBoosterType] = useState(false);
  const [note, setNote] = useState(initialBooster.note ?? "");
  const [savedNote, setSavedNote] = useState(initialBooster.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [domainFilter, setDomainFilter] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const controllerRef = useRef<AbortController | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const fetchResults = useCallback(
    async (searchText: string, setCode: string, lang: string, pageNum: number) => {
      const key = `${searchText}|${setCode}|${lang}|${pageNum}`;
      if (pendingKeyRef.current === key) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      pendingKeyRef.current = key;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchText) params.set("searchQuery", searchText);
        if (setCode && setCode !== "all") params.set("setCode", setCode);
        if (lang) params.set("lang", lang);
        params.set("page", String(pageNum));
        params.set("limit", "24");

        const res = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        const cards: SearchCard[] = Array.isArray(data) ? data : data.cards ?? [];
        setResults(cards);
        setActiveIndex(0);
        if (!Array.isArray(data)) {
          if (Array.isArray(data.setCodes) && data.setCodes.length) setResultSetCodes(data.setCodes);
          setTotalPages(data.totalPages ?? 1);
        }
        setPage(pageNum);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Card search failed:", error);
      } finally {
        // Une requête annulée passe aussi par ici : sans ce garde, elle
        // éteindrait le chargement de celle qui l'a remplacée.
        if (pendingKeyRef.current === key) {
          pendingKeyRef.current = null;
          setLoading(false);
        }
      }
    },
    [gameSlug, booster.lang]
  );

  // Debounced search; special filters in the bar drive the set dropdown + collector-number filter.
  useEffect(() => {
    const parsed = parseCardSearch(rawQuery);
    if (parsed.setCode && parsed.setCode !== selectedSet) {
      setSelectedSet(parsed.setCode);
    }
    const effectiveSet = parsed.setCode ?? selectedSet;
    const searchText = [parsed.text, parsed.cn ? `cn:${parsed.cn}` : ""].filter(Boolean).join(" ");
    const delay = parsed.text ? 300 : 0;
    const timer = window.setTimeout(() => void fetchResults(searchText, effectiveSet, parsed.lang ?? booster.lang, 1), delay);
    return () => window.clearTimeout(timer);
  }, [rawQuery, selectedSet, fetchResults]);

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    const parsed = parseCardSearch(rawQuery);
    const effectiveSet = parsed.setCode ?? selectedSet;
    const searchText = [parsed.text, parsed.cn ? `cn:${parsed.cn}` : ""].filter(Boolean).join(" ");
    void fetchResults(searchText, effectiveSet, parsed.lang ?? booster.lang, next);
  };

  const refetchBooster = useCallback(async () => {
    const res = await fetch(`/api/collection/boosters/${booster.id}`);
    if (res.ok) {
      const data = await res.json();
      setBoosterCards(data.booster?.cards ?? []);
    }
  }, [booster.id]);

  const addCard = async (card: SearchCard, foil = false) => {
    setBusyAddId(card.id);
    const tempId = `tmp-${Date.now()}`;
    setBoosterCards((prev) => [
      ...prev,
      { ...card, id: tempId, collectorNumber: String(card.collectorNumber), foil: foil || undefined },
    ]);
    // Clear the search and return focus to it, ready for the next card.
    setRawQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
    try {
      const res = await fetch(`/api/collection/boosters/${booster.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          name: card.name,
          setCode: card.setCode,
          collectorNumber: String(card.collectorNumber),
          image: card.image,
          lang: card.lang,
          foil,
        }),
      });
      if (res.ok) await refetchBooster();
      else setBoosterCards((prev) => prev.filter((c) => c.id !== tempId));
    } catch {
      setBoosterCards((prev) => prev.filter((c) => c.id !== tempId));
    } finally {
      setBusyAddId(null);
    }
  };

  const removeCard = async (entryId: string) => {
    setBusyRemoveId(entryId);
    const snapshot = boosterCards;
    setBoosterCards((prev) => prev.filter((c) => c.id !== entryId));
    try {
      const res = await fetch(
        `/api/collection/boosters/${booster.id}/cards?entryId=${encodeURIComponent(entryId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) setBoosterCards(snapshot);
    } catch {
      setBoosterCards(snapshot);
    } finally {
      setBusyRemoveId(null);
    }
  };

  const toggleFoil = async (card: BoosterCard) => {
    if (card.id.startsWith("tmp-")) return;
    const next = !card.foil;
    setBusyFoilId(card.id);
    setBoosterCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, foil: next || undefined } : c)));
    try {
      const res = await fetch(`/api/collection/boosters/${booster.id}/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: card.id, foil: next }),
      });
      if (!res.ok) {
        setBoosterCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, foil: card.foil } : c)));
      }
    } catch {
      setBoosterCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, foil: card.foil } : c)));
    } finally {
      setBusyFoilId(null);
    }
  };

  const addToCollection = async () => {
    setBusyCollection(true);
    try {
      const res = await fetch(`/api/collection/boosters/${booster.id}/collection`, { method: "POST" });
      if (res.ok) setAddedToCollection(true);
    } finally {
      setBusyCollection(false);
    }
  };

  const removeFromCollection = async () => {
    setBusyCollection(true);
    try {
      const res = await fetch(`/api/collection/boosters/${booster.id}/collection`, { method: "DELETE" });
      if (res.ok) setAddedToCollection(false);
    } finally {
      setBusyCollection(false);
    }
  };

  // Modification des détails : le type est enregistré dès la sélection, et la
  // valeur précédente est restaurée si l'appel échoue.
  const updateBoosterType = async (next: string) => {
    const previous = boosterType;
    setBoosterType(next);
    setSavingBoosterType(true);
    try {
      const res = await fetch(`/api/collection/boosters/${booster.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: next }),
      });
      if (!res.ok) setBoosterType(previous);
    } catch {
      setBoosterType(previous);
    } finally {
      setSavingBoosterType(false);
    }
  };

  // La note est enregistrée explicitement : contrairement au type, le texte saisi
  // n'est pas restauré en cas d'échec, pour ne pas faire perdre la saisie.
  const saveNote = async () => {
    const trimmed = note.trim();
    setSavingNote(true);
    setNoteError(false);
    try {
      const res = await fetch(`/api/collection/boosters/${booster.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      if (res.ok) {
        setNote(trimmed);
        setSavedNote(trimmed);
      } else {
        setNoteError(true);
      }
    } catch {
      setNoteError(true);
    } finally {
      setSavingNote(false);
    }
  };

  const noteDirty = note.trim() !== savedNote;

  const createSibling = async () => {
    setCreatingSibling(true);
    try {
      const res = await fetch(`/api/collection/boosters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, setCode: booster.setCode, lang: booster.lang, type: boosterType }),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/collection/${gameSlug}/boosters/${id}`);
      } else {
        setCreatingSibling(false);
      }
    } catch {
      setCreatingSibling(false);
    }
  };

  // Les propriétés de carte dépendent du jeu : on ne propose un filtre que si
  // les cartes du booster portent effectivement la propriété.
  const typeOptions = useMemo(
    () => [...new Set(boosterCards.map((card) => card.type).filter((type): type is string => Boolean(type)))].sort(
      (a, b) => collator.compare(a, b)
    ),
    [boosterCards]
  );

  const boosterTypeOptions = useMemo(
    () => getBoosterTypeOptions(gameSlug, boosterType),
    [gameSlug, boosterType]
  );

  const domainOptions = useMemo(
    () => [...new Set(boosterCards.flatMap((card) => card.domain ?? []).filter(Boolean))].sort(
      (a, b) => collator.compare(a, b)
    ),
    [boosterCards]
  );

  // Un filtre dont la valeur n'existe plus (dernière carte de ce type retirée)
  // doit se relâcher, sinon la grille reste vide sans raison visible.
  useEffect(() => {
    if (typeFilter !== ALL && !typeOptions.includes(typeFilter)) setTypeFilter(ALL);
  }, [typeFilter, typeOptions]);

  useEffect(() => {
    if (domainFilter !== ALL && !domainOptions.includes(domainFilter)) setDomainFilter(ALL);
  }, [domainFilter, domainOptions]);

  const visibleCards = useMemo(() => {
    const filtered = boosterCards.filter((card) => {
      if (typeFilter !== ALL && card.type !== typeFilter) return false;
      if (domainFilter !== ALL && !(card.domain ?? []).includes(domainFilter)) return false;
      return true;
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    // Indexation préalable : le tri « par défaut » suit l'ordre du booster, et
    // sert aussi de départage stable pour les autres critères.
    return filtered
      .map((card, index) => ({ card, index }))
      .sort((a, b) => {
        if (sortKey === "default") return (a.index - b.index) * direction;
        const compared = compareCards(a.card, b.card, sortKey) * direction;
        // Le départage garde l'ordre du booster même en décroissant : seul le
        // critère principal est inversé, deux ex-aequo ne permutent pas.
        return compared !== 0 ? compared : a.index - b.index;
      })
      .map(({ card }) => card);
  }, [boosterCards, typeFilter, domainFilter, sortKey, sortDirection]);

  const filtersActive = typeFilter !== ALL || domainFilter !== ALL;

  const resetFilters = () => {
    setTypeFilter(ALL);
    setDomainFilter(ALL);
  };

  const setOptions = useMemo(() => {
    const set = new Set<string>([initialBooster.setCode, ...resultSetCodes]);
    return [...set].filter(Boolean).sort();
  }, [initialBooster.setCode, resultSetCodes]);

  const focusCardAt = (index: number) => {
    if (results.length === 0) return;
    const clamped = Math.max(0, Math.min(index, results.length - 1));
    setActiveIndex(clamped);
    cardRefs.current[clamped]?.focus();
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (results.length === 0) return;
    const cols = window.innerWidth >= 640 ? 4 : 3; // matches grid-cols-3 sm:grid-cols-4
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusCardAt(activeIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusCardAt(activeIndex - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusCardAt(activeIndex + cols);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (activeIndex - cols < 0) searchRef.current?.focus();
        else focusCardAt(activeIndex - cols);
        break;
      case "f":
      case "F":
        e.preventDefault();
        void addCard(results[activeIndex], true);
        break;
      default:
        break;
    }
    // Enter / Space add the focused card (normal) natively via the button's onClick.
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href={`/collection/${gameSlug}/boosters`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("boosters.backToList")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("boosters.editorTitle")}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-[11px]">{booster.setCode}</Badge>
              <Badge variant="secondary" className="text-[11px]">{langLabel(booster.lang)}</Badge>
              <Select value={boosterType} onValueChange={updateBoosterType} disabled={savingBoosterType}>
                <SelectTrigger size="sm" className="h-6 gap-1 px-2 text-[11px]" aria-label={t("boosters.type")}>
                  <SelectValue placeholder={t("boosters.typePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {boosterTypeOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {boosterTypeLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingBoosterType ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
              <span className="text-xs text-muted-foreground">{gameName}</span>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {addedToCollection ? (
              <>
                <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
                  <CheckCircle2 className="size-3.5" />
                  {t("boosters.inCollection")}
                </Badge>
                <Button variant="outline" className="gap-2" onClick={removeFromCollection} disabled={busyCollection}>
                  {busyCollection ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                  {t("boosters.removeFromCollection")}
                </Button>
              </>
            ) : (
              <Button variant="secondary" className="gap-2" onClick={addToCollection} disabled={busyCollection || boosterCards.length === 0}>
                {busyCollection ? <Loader2 className="size-4 animate-spin" /> : <Library className="size-4" />}
                {t("boosters.addToCollection")}
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={createSibling} disabled={creatingSibling}>
              {creatingSibling ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("boosters.create")}
            </Button>
          </div>
        </div>
      </div>

      {/* Note libre du booster */}
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <NotebookPen className="size-4 text-muted-foreground" />
          <Label htmlFor="booster-note" className="text-sm font-semibold">{t("boosters.note")}</Label>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {note.length}/{BOOSTER_NOTE_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="booster-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={BOOSTER_NOTE_MAX_LENGTH}
          rows={3}
          placeholder={t("boosters.notePlaceholder")}
          aria-describedby="booster-note-hint"
        />
        <div className="flex flex-wrap items-center gap-2">
          <p id="booster-note-hint" className="text-xs text-muted-foreground">
            {noteError ? (
              <span className="text-destructive">{t("boosters.noteError")}</span>
            ) : (
              t("boosters.noteHint")
            )}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {noteDirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={savingNote}
                onClick={() => {
                  setNote(savedNote);
                  setNoteError(false);
                }}
              >
                {t("boosters.cancel")}
              </Button>
            ) : null}
            <Button type="button" size="sm" className="gap-2" onClick={saveNote} disabled={savingNote || !noteDirty}>
              {savingNote ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("boosters.saveNote")}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Booster contents */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {t("boosters.contents", { count: boosterCards.length })}
            </h2>
            {filtersActive ? (
              <Badge variant="secondary" className="text-[11px]">
                {t("boosters.filteredCount", { count: visibleCards.length })}
              </Badge>
            ) : null}
          </div>

          {boosterCards.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {typeOptions.length > 0 ? (
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-auto min-w-[130px]" aria-label={t("boosters.filterByType")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("boosters.allTypes")}</SelectItem>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {domainOptions.length > 0 ? (
                <Select value={domainFilter} onValueChange={setDomainFilter}>
                  <SelectTrigger className="w-auto min-w-[130px]" aria-label={t("boosters.filterByDomain")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("boosters.allDomains")}</SelectItem>
                    {domainOptions.map((domain) => (
                      <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <SelectTrigger className="w-auto min-w-[150px]" aria-label={t("boosters.sortBy")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>{t(`boosters.sort.${key}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                aria-label={sortDirection === "asc" ? t("boosters.sortAscending") : t("boosters.sortDescending")}
                title={sortDirection === "asc" ? t("boosters.sortAscending") : t("boosters.sortDescending")}
              >
                {sortDirection === "asc" ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}
              </Button>
              {filtersActive ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                  {t("boosters.resetFilters")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {boosterCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Package className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("boosters.emptyBooster")}</p>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Package className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("boosters.noCardMatchesFilters")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
              {visibleCards.map((card) => (
                <div key={card.id} className="group relative overflow-hidden rounded-lg border bg-card">
                  <div className="relative aspect-[3/4] w-full bg-muted">
                    <Image src={card.image} alt={card.name} fill unoptimized sizes="120px" className="object-cover" />
                    <Button
                      type="button"
                      size="icon-sm"
                      className={`absolute left-1 top-1 size-6 ${
                        card.foil
                          ? "bg-amber-500 text-white hover:bg-amber-500/90"
                          : "bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
                      }`}
                      disabled={busyFoilId === card.id || card.id.startsWith("tmp-")}
                      onClick={() => toggleFoil(card)}
                      aria-label={t("boosters.toggleFoil")}
                      title={t("boosters.foil")}
                    >
                      {busyFoilId === card.id ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                      disabled={busyRemoveId === card.id || card.id.startsWith("tmp-")}
                      onClick={() => removeCard(card.id)}
                      aria-label={t("boosters.removeCard")}
                    >
                      {busyRemoveId === card.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                    </Button>
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[11px] font-medium leading-tight" title={card.name}>{card.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {card.setCode} #{card.collectorNumber}
                      {card.foil ? <span className="ml-1 font-semibold text-amber-500">· {t("boosters.foil")}</span> : null}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Search & add */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("boosters.addCards")}</h2>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={rawQuery}
                onChange={(e) => setRawQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (results.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusCardAt(0);
                  } else if (e.key === "Enter") {
                    // Enter from the search bar validates the first card.
                    e.preventDefault();
                    void addCard(results[0]);
                  }
                }}
                placeholder={t("boosters.searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <Select value={selectedSet} onValueChange={setSelectedSet}>
              <SelectTrigger className="w-full sm:w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {setOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            {t("boosters.searchHint")}
          </p>

          {results.length === 0 && !loading ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              {t("boosters.noResults")}
            </div>
          ) : (
            <div
              className="grid grid-cols-3 gap-2 sm:grid-cols-4"
              role="grid"
              onKeyDown={handleGridKeyDown}
            >
              {results.map((card, i) => (
                <div key={`${card.id}-${card.setCode}-${card.collectorNumber}`} className="group relative">
                  <button
                    type="button"
                    ref={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    tabIndex={i === activeIndex ? 0 : -1}
                    onClick={() => addCard(card)}
                    onFocus={() => setActiveIndex(i)}
                    disabled={busyAddId === card.id}
                    aria-label={t("boosters.addCard", { name: card.name })}
                    className="block w-full overflow-hidden rounded-lg border bg-card text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="relative aspect-[3/4] w-full bg-muted">
                      <Image src={card.image} alt={card.name} fill unoptimized sizes="120px" className="object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 group-focus-within:bg-black/40 group-focus-within:opacity-100">
                        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                          {busyAddId === card.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}
                        </span>
                      </span>
                    </div>
                    <div className="p-1.5">
                      <p className="truncate text-[11px] font-medium leading-tight" title={card.name}>{card.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{card.setCode} #{card.collectorNumber}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => addCard(card, true)}
                    disabled={busyAddId === card.id}
                    aria-label={t("boosters.addFoil", { name: card.name })}
                    title={t("boosters.foil")}
                    className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow transition-opacity hover:bg-amber-500/90 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <Sparkles className="size-3" />
                    {t("boosters.foil")}
                  </button>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1 || loading} onClick={() => goToPage(page - 1)}>
                {t("filters.previous")}
              </Button>
              <span className="text-sm text-muted-foreground">{t("filters.pageOf", { page, totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages || loading} onClick={() => goToPage(page + 1)}>
                {t("filters.next")}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
