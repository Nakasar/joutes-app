"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation.ts";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft, Info, Layers, Loader2, Minus, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { cardSearchText, parseCardSearch } from "@/lib/cards/search-query.ts";
import { buildSearchFields, keepFilterTokens } from "@/lib/cards/search-syntax.ts";
import {
  EMPTY_CRITERIA,
  serializeCardSearchCriteria,
  type CardFilterFacet,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters.ts";
import { CardSearchToolbar } from "@/components/cards/CardSearchToolbar.tsx";
import { formatCardList } from "@/lib/cubes/card-list.ts";
import { CUBE_PACK_CARD_MAX_QUANTITY } from "@/lib/constants/cubes.ts";
import type { BoosterCard } from "@/lib/types/booster.ts";
import type { Cube, CubePack } from "@/lib/types/Cube.ts";
import ExportCardListDialog from "@/app/[locale]/(app)/cubes/ExportCardListDialog.tsx";
import ImportPackDialog from "./ImportPackDialog.tsx";

/** Carte du paquet, réduite à ce que l'interface affiche. */
export type PackCard = {
  id: string;
  cardId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
};

type Props = {
  cube: Cube;
  pack: CubePack;
  packLabel: string;
  initialCards: PackCard[];
  canEdit: boolean;
};

/** Une ligne par carte distincte : le paquet stocke un document par exemplaire. */
type GroupedCard = { card: PackCard; quantity: number };

const ALL_SETS = "all";

export default function PackEditor({ cube, pack, packLabel, initialCards, canEdit }: Props) {
  const t = useTranslations("Cubes");
  const router = useRouter();
  const gameSlug = cube.gameSlug ?? cube.gameId;

  const [cards, setCards] = useState<PackCard[]>(initialCards);
  // Les ajouts et retraits sont appliqués localement pour rester immédiats ; ce
  // rattrapage réaligne la liste sur le serveur après un `router.refresh()`.
  useEffect(() => setCards(initialCards), [initialCards]);

  // Une seule modification de quantité à la fois : chaque réponse renvoie le
  // paquet entier, et deux écritures concurrentes se renverraient des
  // instantanés calculés avant l'autre.
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const busy = busyCardId !== null;

  const [rawQuery, setRawQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState(ALL_SETS);
  const [results, setResults] = useState<BoosterCard[]>([]);
  const [resultSetCodes, setResultSetCodes] = useState<string[]>([]);
  // Facettes du jeu et critères choisis : le même vocabulaire que la galerie de
  // cartes, servi par la même réponse d'API.
  const [facets, setFacets] = useState<CardFilterFacet[]>([]);
  // Tant qu'aucune réponse n'est arrivée, une liste vide ne veut rien dire.
  const [facetsKnown, setFacetsKnown] = useState(false);
  const [resultTypes, setResultTypes] = useState<string[]>([]);
  const [resultLanguages, setResultLanguages] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<CardSearchCriteria>(EMPTY_CRITERIA);
  // Vocabulaire de la saisie : les attributs du jeu et les listes qu'il porte.
  // Bâti ici plutôt que dans la barre, car l'ajout d'une carte s'en sert pour
  // ne garder que les filtres.
  const searchFields = useMemo(
    () => buildSearchFields(facets, { setCodes: resultSetCodes, types: resultTypes, languages: resultLanguages }),
    [facets, resultSetCodes, resultTypes, resultLanguages],
  );
  const [filtersUnavailable, setFiltersUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [name, setName] = useState(pack.name ?? "");
  const [type, setType] = useState(pack.type ?? "");
  const [savingDetails, setSavingDetails] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const grouped = useMemo(() => {
    const byCardId = new Map<string, GroupedCard>();
    for (const card of cards) {
      const entry = byCardId.get(card.cardId);
      if (entry) {
        entry.quantity += 1;
      } else {
        byCardId.set(card.cardId, { card, quantity: 1 });
      }
    }
    return [...byCardId.values()];
  }, [cards]);

  const quantityOf = (cardId: string) => grouped.find((entry) => entry.card.cardId === cardId)?.quantity ?? 0;

  const fetchResults = useCallback(
    async (
      searchText: string,
      setCode: string,
      lang: string,
      pageNum: number,
      searchCriteria: CardSearchCriteria,
    ) => {
      const criteriaEntries = serializeCardSearchCriteria(searchCriteria);
      const key = `${searchText}|${setCode}|${lang}|${pageNum}|${new URLSearchParams(criteriaEntries)}`;
      if (pendingKeyRef.current === key) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      pendingKeyRef.current = key;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchText) params.set("searchQuery", searchText);
        if (setCode && setCode !== ALL_SETS) params.set("setCode", setCode);
        params.set("lang", lang);
        for (const [param, value] of criteriaEntries) params.set(param, value);
        params.set("page", String(pageNum));
        params.set("limit", "24");

        const res = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        const found: BoosterCard[] = Array.isArray(data) ? data : data.cards ?? [];
        setResults(found);
        setActiveIndex(0);
        if (!Array.isArray(data)) {
          if (Array.isArray(data.setCodes) && data.setCodes.length) setResultSetCodes(data.setCodes);
          if (Array.isArray(data.types)) setResultTypes(data.types);
          if (Array.isArray(data.languages)) setResultLanguages(data.languages);
          if (Array.isArray(data.facets)) setFacets(data.facets);
          setFacetsKnown(true);
          setFiltersUnavailable(data.filtersUnavailable === true);
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
    [gameSlug],
  );

  // Recherche différée ; les filtres écrits dans la barre pilotent l'extension.
  useEffect(() => {
    const parsed = parseCardSearch(rawQuery);
    if (parsed.setCode && parsed.setCode !== selectedSet) {
      setSelectedSet(parsed.setCode);
    }
    const delay = parsed.text ? 300 : 0;
    const timer = window.setTimeout(
      () => void fetchResults(cardSearchText(rawQuery), parsed.setCode ?? selectedSet, parsed.lang ?? "all", 1, criteria),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [rawQuery, selectedSet, criteria, fetchResults]);

  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || loading) return;
    const parsed = parseCardSearch(rawQuery);
    void fetchResults(cardSearchText(rawQuery), parsed.setCode ?? selectedSet, parsed.lang ?? "all", next, criteria);
  };

  /** Fixe le nombre d'exemplaires d'une carte ; le serveur renvoie le paquet à jour. */
  const setQuantity = async (card: PackCard, quantity: number) => {
    if (busy || quantity < 0 || quantity > CUBE_PACK_CARD_MAX_QUANTITY) return;
    setBusyCardId(card.cardId);
    const snapshot = cards;
    try {
      const res = await fetch(`/api/cubes/${cube.id}/packs/${pack.id}/cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.cardId,
          name: card.name,
          setCode: card.setCode,
          collectorNumber: card.collectorNumber,
          image: card.image,
          quantity,
        }),
      });
      if (res.ok) {
        const data: { cards: PackCard[] } = await res.json();
        setCards(data.cards);
        router.refresh();
      } else {
        setCards(snapshot);
      }
    } catch {
      setCards(snapshot);
    } finally {
      setBusyCardId(null);
    }
  };

  const addFromSearch = (found: BoosterCard) => {
    if (busy) return;
    const card: PackCard = {
      id: found.id,
      cardId: found.id,
      name: found.name,
      setCode: found.setCode,
      collectorNumber: String(found.collectorNumber),
      image: found.image,
    };
    void setQuantity(card, quantityOf(card.cardId) + 1);
    // Le nom cherché s'en va et la barre reprend le focus, prête pour la carte
    // suivante ; les filtres tapés restent, eux : ils décrivent le paquet qu'on
    // est en train de composer, pas la carte qu'on vient d'ajouter.
    setRawQuery(keepFilterTokens(rawQuery, searchFields));
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  /** L'import renvoie le paquet complet : il remplace la liste locale d'un bloc. */
  const onImported = (imported: PackCard[]) => {
    setCards(imported);
    router.refresh();
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/cubes/${cube.id}/packs/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type: type.trim() }),
      });
      if (res.ok) {
        setDetailsOpen(false);
        router.refresh();
      }
    } finally {
      setSavingDetails(false);
    }
  };

  const setOptions = useMemo(
    () => [ALL_SETS, ...[...new Set(resultSetCodes)].filter(Boolean).sort()],
    [resultSetCodes],
  );

  const focusCardAt = (index: number) => {
    if (results.length === 0) return;
    const clamped = Math.max(0, Math.min(index, results.length - 1));
    setActiveIndex(clamped);
    cardRefs.current[clamped]?.focus();
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (results.length === 0) return;
    const cols = window.innerWidth >= 640 ? 4 : 3; // suit grid-cols-3 sm:grid-cols-4
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
      default:
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/cubes/${cube.id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToCube", { name: cube.name })}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{packLabel}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {pack.type ? <Badge variant="secondary" className="text-[11px]">{pack.type}</Badge> : null}
              <span className="text-xs text-muted-foreground">{t("cardCount", { count: cards.length })}</span>
              {grouped.length !== cards.length ? (
                <span className="text-xs text-muted-foreground">
                  {t("distinctCardCount", { count: grouped.length })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ExportCardListDialog
              title={t("export.packTitle")}
              triggerLabel={t("export.trigger")}
              fileName={packLabel}
              getText={() => formatCardList(cards)}
            />
            {canEdit ? (
              <ImportPackDialog cubeId={cube.id} packId={pack.id} onImported={onImported} />
            ) : null}
            {canEdit ? (
              <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Pencil className="size-4" />
                    {t("editPack")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("editPackTitle")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1">
                      <Label htmlFor="pack-edit-name">{t("form.packName")}</Label>
                      <Input id="pack-edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pack-edit-type">{t("form.packType")}</Label>
                      <Input id="pack-edit-type" value={type} onChange={(e) => setType(e.target.value)} maxLength={100} />
                    </div>
                    <p className="text-xs text-muted-foreground">{t("form.packHint")}</p>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDetailsOpen(false)}>{t("cancel")}</Button>
                    <Button onClick={saveDetails} disabled={savingDetails} className="gap-2">
                      {savingDetails ? <Loader2 className="size-4 animate-spin" /> : null}
                      {t("save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Contenu du paquet */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("packContents")}</h2>

          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Layers className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{canEdit ? t("emptyPackEditable") : t("emptyPack")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
              {grouped.map(({ card, quantity }) => (
                <div key={card.cardId} className="group relative overflow-hidden rounded-lg border bg-card">
                  <div className="relative aspect-[3/4] w-full bg-muted">
                    {card.image ? (
                      <Image src={card.image} alt={card.name} fill unoptimized sizes="120px" className="object-cover" />
                    ) : null}
                    {quantity > 1 ? (
                      <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                        ×{quantity}
                      </span>
                    ) : null}
                    {canEdit ? (
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                        disabled={busy}
                        onClick={() => setQuantity(card, 0)}
                        aria-label={t("removeCard", { name: card.name })}
                      >
                        <X className="size-3" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[11px] font-medium leading-tight" title={card.name}>{card.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {card.setCode} #{card.collectorNumber}
                    </p>
                    {canEdit ? (
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="size-6"
                          disabled={busy}
                          onClick={() => setQuantity(card, quantity - 1)}
                          aria-label={t("decreaseQuantity", { name: card.name })}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="text-[11px] font-semibold tabular-nums">
                          {busyCardId === card.cardId ? <Loader2 className="size-3 animate-spin" /> : quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="size-6"
                          disabled={busy || quantity >= CUBE_PACK_CARD_MAX_QUANTITY}
                          onClick={() => setQuantity(card, quantity + 1)}
                          aria-label={t("increaseQuantity", { name: card.name })}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recherche et ajout */}
        {canEdit ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("addCards")}</h2>

            <CardSearchToolbar
              query={rawQuery}
              onQueryChange={setRawQuery}
              criteria={criteria}
              onCriteriaChange={setCriteria}
              facets={facets}
              fields={searchFields}
              filtersUnavailable={filtersUnavailable}
              filtersPending={!facetsKnown}
              placeholder={t("searchCardPlaceholder")}
              inputRef={searchRef}
              onInputKeyDown={(e) => {
                if (results.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  focusCardAt(0);
                } else if (e.key === "Enter") {
                  // Entrée depuis la barre valide la première carte.
                  e.preventDefault();
                  addFromSearch(results[0]);
                }
              }}
            >
              <Select value={selectedSet} onValueChange={setSelectedSet}>
                <SelectTrigger className="w-full sm:w-[150px]" aria-label={t("filterBySet")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {setOptions.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code === ALL_SETS ? t("allSets") : code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardSearchToolbar>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              {t("searchHint")}
            </p>

            {results.length === 0 && !loading ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                {t("noCardFound")}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="grid" onKeyDown={handleGridKeyDown}>
                {results.map((found, index) => {
                  const inPack = quantityOf(found.id);
                  return (
                    <button
                      key={`${found.id}-${found.setCode}-${found.collectorNumber}`}
                      type="button"
                      ref={(el) => {
                        cardRefs.current[index] = el;
                      }}
                      tabIndex={index === activeIndex ? 0 : -1}
                      onClick={() => addFromSearch(found)}
                      onFocus={() => setActiveIndex(index)}
                      disabled={busy}
                      aria-label={t("addCard", { name: found.name })}
                      className="group relative block w-full overflow-hidden rounded-lg border bg-card text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="relative aspect-[3/4] w-full bg-muted">
                        {found.image ? (
                          <Image src={found.image} alt={found.name} fill unoptimized sizes="120px" className="object-cover" />
                        ) : null}
                        {inPack > 0 ? (
                          <span className="absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                            ×{inPack}
                          </span>
                        ) : null}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 group-focus-within:bg-black/40 group-focus-within:opacity-100">
                          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                            {busyCardId === found.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}
                          </span>
                        </span>
                      </div>
                      <div className="p-1.5">
                        <p className="truncate text-[11px] font-medium leading-tight" title={found.name}>{found.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {found.setCode} #{found.collectorNumber}
                        </p>
                      </div>
                    </button>
                  );
                })}
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
                  {t("previousPage")}
                </Button>
                <span className="text-sm text-muted-foreground">{t("pageOf", { page, totalPages })}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages || loading} onClick={() => goToPage(page + 1)}>
                  {t("nextPage")}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
