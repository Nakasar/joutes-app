"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft, Search, Plus, X, Loader2, Package, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Booster, BoosterCard } from "@/lib/types/booster";

const LANG_LABELS: Record<string, string> = {
  en: "🇬🇧 EN", fr: "🇫🇷 FR", it: "🇮🇹 IT", de: "🇩🇪 DE",
  es: "🇪🇸 ES", ja: "🇯🇵 JA", ko: "🇰🇷 KO", zh: "🇨🇳 ZH",
};
const langLabel = (code: string) => LANG_LABELS[code.toLowerCase()] ?? code.toUpperCase();

type SearchCard = BoosterCard & { type?: string };

/** Parse in-bar special filters: `e:XXX` / `set:XXX` -> set, `cn:000a` -> collector number. */
function parseSearch(raw: string): { setCode: string | null; cn: string | null; text: string } {
  let text = ` ${raw} `;
  let setCode: string | null = null;
  let cn: string | null = null;
  const e = text.match(/(?:^|\s)(?:e|set):([\w*]+)/i);
  if (e) {
    setCode = e[1].toUpperCase();
    text = text.replace(e[0], " ");
  }
  const c = text.match(/(?:^|\s)cn:([\w*]+)/i);
  if (c) {
    cn = c[1];
    text = text.replace(c[0], " ");
  }
  const trimmed = text.trim();
  // A bare number is treated as a collector-number filter.
  if (!cn && /^\d+$/.test(trimmed)) {
    return { setCode, cn: trimmed, text: "" };
  }
  return { setCode, cn, text: trimmed };
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

  const controllerRef = useRef<AbortController | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const fetchResults = useCallback(
    async (searchText: string, setCode: string, pageNum: number) => {
      const key = `${searchText}|${setCode}|${pageNum}`;
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
        if (booster.lang) params.set("lang", booster.lang);
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
        if (pendingKeyRef.current === key) pendingKeyRef.current = null;
        setLoading(false);
      }
    },
    [gameSlug, booster.lang]
  );

  // Debounced search; special filters in the bar drive the set dropdown + collector-number filter.
  useEffect(() => {
    const parsed = parseSearch(rawQuery);
    if (parsed.setCode && parsed.setCode !== selectedSet) {
      setSelectedSet(parsed.setCode);
    }
    const effectiveSet = parsed.setCode ?? selectedSet;
    const searchText = [parsed.text, parsed.cn ? `cn:${parsed.cn}` : ""].filter(Boolean).join(" ");
    const delay = parsed.text ? 300 : 0;
    const timer = window.setTimeout(() => void fetchResults(searchText, effectiveSet, 1), delay);
    return () => window.clearTimeout(timer);
  }, [rawQuery, selectedSet, fetchResults]);

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    const parsed = parseSearch(rawQuery);
    const effectiveSet = parsed.setCode ?? selectedSet;
    const searchText = [parsed.text, parsed.cn ? `cn:${parsed.cn}` : ""].filter(Boolean).join(" ");
    void fetchResults(searchText, effectiveSet, next);
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

  const createSibling = async () => {
    setCreatingSibling(true);
    try {
      const res = await fetch(`/api/collection/boosters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, setCode: booster.setCode, lang: booster.lang }),
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
              <span className="text-xs text-muted-foreground">{gameName}</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="ml-auto gap-2"
            onClick={createSibling}
            disabled={creatingSibling}
          >
            {creatingSibling ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t("boosters.create")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Booster contents */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("boosters.contents", { count: boosterCards.length })}
          </h2>
          {boosterCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Package className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("boosters.emptyBooster")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
              {boosterCards.map((card) => (
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
