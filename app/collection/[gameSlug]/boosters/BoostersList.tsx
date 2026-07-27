"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Trash2,
  Loader2,
  PackagePlus,
  CheckCircle2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Booster, BoosterCard } from "@/lib/types/booster";
import { getBoosterTypes, OTHER_BOOSTER_TYPE } from "@/lib/constants/booster-types";
import { BOOSTER_CARD_FILTER_MAX } from "@/lib/constants/boosters";
import CardsPicker from "@/components/CardsPicker";
import SetCombobox from "./SetCombobox";
import { useBoosterTypeLabel } from "./useBoosterTypeLabel";

const LANG_LABELS: Record<string, string> = {
  en: "🇬🇧 EN", fr: "🇫🇷 FR", it: "🇮🇹 IT", de: "🇩🇪 DE",
  es: "🇪🇸 ES", ja: "🇯🇵 JA", ko: "🇰🇷 KO", zh: "🇨🇳 ZH",
};
function langLabel(code: string): string {
  return LANG_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

const ALL = "all";

type Props = {
  gameSlug: string;
  gameName: string;
  initialBoosters: Booster[];
  setCodes: string[];
  langs: string[];
  /** Types réellement présents dans les boosters de l'utilisateur pour ce jeu. */
  typesInUse: string[];
  typeFilter?: string;
  /** Cartes que les boosters affichés contiennent toutes. */
  cardFilter: BoosterCard[];
  sort: "newest" | "oldest";
  page: number;
  totalPages: number;
  total: number;
};

export default function BoostersList({
  gameSlug,
  gameName,
  initialBoosters,
  setCodes,
  langs,
  typesInUse,
  typeFilter,
  cardFilter,
  sort,
  page,
  totalPages,
  total,
}: Props) {
  const t = useTranslations("Collection");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const boosterTypeLabel = useBoosterTypeLabel();
  const boosterTypes = getBoosterTypes(gameSlug);

  const [boosters, setBoosters] = useState<Booster[]>(initialBoosters);

  // La liste est paginée côté serveur : chaque navigation (page, filtre, tri)
  // remplace les boosters affichés.
  useEffect(() => setBoosters(initialBoosters), [initialBoosters]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [setCode, setSetCode] = useState(setCodes[0] ?? "");
  const [lang, setLang] = useState(langs[0] ?? "en");
  const [type, setType] = useState(OTHER_BOOSTER_TYPE);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  // Sélection de travail : le filtre n'est appliqué qu'à la validation, pour
  // pouvoir choisir plusieurs cartes sans recharger la liste à chaque ajout.
  const [draftCards, setDraftCards] = useState<BoosterCard[]>(cardFilter);

  /** Les filtres et le tri vivent dans l'URL : la page est partageable et le retour arrière fonctionne. */
  const urlWith = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  // Changer de filtre ou de tri renvoie en première page : le numéro de page
  // courant n'a plus de sens sur un autre jeu de résultats.
  const goTo = (changes: Record<string, string | undefined>) => router.push(urlWith({ ...changes, page: undefined }));

  const goToCards = (cards: BoosterCard[]) => goTo({ cards: cards.map((card) => card.id).join(",") || undefined });

  const filtersActive = Boolean(typeFilter) || cardFilter.length > 0;

  const create = async () => {
    if (!setCode || !lang) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/collection/boosters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, setCode, lang, type }),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/collection/${gameSlug}/boosters/${id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/collection/boosters/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBoosters((prev) => prev.filter((b) => b.id !== id));
        // Le total et le nombre de pages sont calculés côté serveur.
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/collection/${gameSlug}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("game.backToCollection", { game: gameName })}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("boosters.title")}</h1>
            <p className="text-muted-foreground">{t("boosters.subtitle", { game: gameName })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/collection/${gameSlug}/boosters/stats`}>
              <BarChart3 className="size-4" />
              {t("boosters.stats.link")}
            </Link>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("boosters.create")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("boosters.createTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t("boosters.set")}</Label>
                  <SetCombobox value={setCode} onChange={setSetCode} options={setCodes} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("boosters.type")}</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("boosters.typePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {boosterTypes.map((value) => (
                        <SelectItem key={value} value={value}>
                          {boosterTypeLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("boosters.language")}</Label>
                  <Select value={lang} onValueChange={setLang}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("boosters.languagePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {langs.map((l) => (
                        <SelectItem key={l} value={l}>
                          {langLabel(l)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  {t("boosters.cancel")}
                </Button>
                <Button onClick={create} disabled={creating || !setCode || !lang}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t("boosters.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      {total > 0 || filtersActive ? (
        <div className="flex flex-wrap items-center gap-2">
          {typesInUse.length > 1 ? (
            <Select value={typeFilter ?? ALL} onValueChange={(value) => goTo({ type: value === ALL ? undefined : value })}>
              <SelectTrigger className="w-auto min-w-[150px]" aria-label={t("boosters.filterByType")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("boosters.allTypes")}</SelectItem>
                {typesInUse.map((value) => (
                  <SelectItem key={value} value={value}>
                    {boosterTypeLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={sort} onValueChange={(value) => goTo({ sort: value === "newest" ? undefined : value })}>
            <SelectTrigger className="w-auto min-w-[170px]" aria-label={t("boosters.sortBoosters")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("boosters.sortNewest")}</SelectItem>
              <SelectItem value="oldest">{t("boosters.sortOldest")}</SelectItem>
            </SelectContent>
          </Select>
          <Dialog
            open={cardDialogOpen}
            onOpenChange={(open) => {
              if (open) setDraftCards(cardFilter);
              setCardDialogOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="gap-2">
                <Search className="size-4" />
                {t("boosters.filterByCards")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("boosters.filterByCardsTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 pt-2">
                <p className="text-sm text-muted-foreground">{t("boosters.filterByCardsHint")}</p>
                <CardsPicker
                  gameSlugOrId={gameSlug}
                  selectedCards={draftCards}
                  onChange={(cards) => setDraftCards(cards.slice(0, BOOSTER_CARD_FILTER_MAX))}
                  searchPlaceholder={t("boosters.searchPlaceholder")}
                  emptyMessage={t("boosters.noResults")}
                  searchingLabel={t("boosters.searching")}
                  getRemoveLabel={(name) => t("boosters.removeCardFilter", { name })}
                />
                {draftCards.length >= BOOSTER_CARD_FILTER_MAX ? (
                  <p className="text-xs text-muted-foreground">
                    {t("boosters.cardFilterLimit", { count: BOOSTER_CARD_FILTER_MAX })}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCardDialogOpen(false)}>
                  {t("boosters.cancel")}
                </Button>
                <Button
                  onClick={() => {
                    setCardDialogOpen(false);
                    goToCards(draftCards);
                  }}
                >
                  {t("boosters.applyCardFilter")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <span className="text-sm text-muted-foreground">{t("boosters.boosterCount", { count: total })}</span>
          {filtersActive ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => goTo({ type: undefined, cards: undefined })}>
              {t("boosters.resetFilters")}
            </Button>
          ) : null}
          {/* `w-full` : les cartes filtrées passent sur leur propre ligne sous les filtres. */}
          {cardFilter.length > 0 ? (
            <div className="flex w-full flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("boosters.containsCards")}</span>
              {cardFilter.map((card) => (
                <Badge key={card.id} variant="secondary" className="gap-1 py-0.5 pr-1 text-[11px]">
                  {card.name}
                  <button
                    type="button"
                    onClick={() => goToCards(cardFilter.filter((c) => c.id !== card.id))}
                    aria-label={t("boosters.removeCardFilter", { name: card.name })}
                    title={t("boosters.removeCardFilter", { name: card.name })}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {boosters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <PackagePlus className="size-10 text-muted-foreground" />
          <div>
            {filtersActive ? (
              <p className="font-semibold">{t("boosters.noBoosterMatchesFilters")}</p>
            ) : (
              <>
                <p className="font-semibold">{t("boosters.emptyTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("boosters.emptyDescription")}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boosters.map((booster) => (
            <div key={booster.id} className="group relative flex flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
              <Link href={`/collection/${gameSlug}/boosters/${booster.id}`} className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Package className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[11px]">{booster.setCode}</Badge>
                    <Badge variant="secondary" className="text-[11px]">{langLabel(booster.lang)}</Badge>
                    <Badge variant="secondary" className="text-[11px]">{boosterTypeLabel(booster.type)}</Badge>
                    {booster.addedToCollection ? (
                      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        {t("boosters.inCollection")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">
                    {t("boosters.cardCount", { count: booster.cards?.length ?? 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {DateTime.fromISO(booster.createdAt).setLocale(locale).toLocaleString(DateTime.DATE_MED)}
                  </p>
                  {booster.note ? (
                    <p className="mt-1.5 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground" title={booster.note}>
                      {booster.note}
                    </p>
                  ) : null}
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-2 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                disabled={deletingId === booster.id}
                onClick={() => remove(booster.id)}
                aria-label={t("boosters.delete")}
              >
                {deletingId === booster.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" className="gap-1" asChild={page > 1} disabled={page <= 1}>
            {page > 1 ? (
              <Link href={urlWith({ page: page - 1 === 1 ? undefined : String(page - 1) })}>
                <ChevronLeft className="size-4" />
                {t("boosters.previousPage")}
              </Link>
            ) : (
              <span>
                <ChevronLeft className="size-4" />
                {t("boosters.previousPage")}
              </span>
            )}
          </Button>
          <span className="text-sm text-muted-foreground">{t("boosters.pageOf", { page, totalPages })}</span>
          <Button variant="outline" size="sm" className="gap-1" asChild={page < totalPages} disabled={page >= totalPages}>
            {page < totalPages ? (
              <Link href={urlWith({ page: String(page + 1) })}>
                {t("boosters.nextPage")}
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span>
                {t("boosters.nextPage")}
                <ChevronRight className="size-4" />
              </span>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
