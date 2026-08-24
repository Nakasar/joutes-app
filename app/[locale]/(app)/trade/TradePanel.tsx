"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import CardImage from "@/components/cards/CardImage.tsx";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, FileText, List, Loader2, Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { TradeCard, TradeCardScope, TradeCardSearchResult, TradeGame } from "@/lib/db/trades.ts";
import type { MarketPrice } from "@/lib/prices/display.ts";
import type { CardOrientation } from "@/lib/types/card.ts";
import { DEFAULT_MARKET_CURRENCY, formatCardPrice } from "@/lib/prices/display.ts";
import { appliedUnitPrice, isNegotiatedPrice, sideTotal } from "@/lib/trade/pricing.ts";
import { applyTradeText, parseTradeText, stringifyTradeCards } from "@/lib/trade/text.ts";
import { CardPriceTag } from "@/components/cards/CardPriceTag.tsx";
import { PRICE_SOURCE_LABELS, marketProductUrl } from "@/lib/prices/sources.ts";
import { TRADE_MAX_CARDS_PER_SIDE, TRADE_MAX_UNIT_PRICE } from "@/lib/constants/trade.ts";

/** Une carte affichée dans un espace d'échange, avec son plafond de quantité. */
export type TradePanelCard = {
  key: string;
  cardId?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  /** Sens d'impression de la carte, relu du catalogue. */
  orientation?: CardOrientation;
  gameName?: string;
  gameSlug?: string;
  quantity: number;
  /** Plafond du bouton « + » : exemplaires possédés connus, sinon la borne d'échange. */
  maxQuantity: number;
  /** Prix de marché relevé pour la carte (cf. docs/CARD_PRICES.md). */
  marketPrice?: MarketPrice;
  /** Prix décidé pour cet échange, à l'unité ; à défaut, celui du marché. */
  unitPrice?: number;
};

const ALL_GAMES = "all";

/**
 * Le prix d'une carte dans une offre : celui qui s'applique, la ligne qu'il
 * donne une fois multiplié par les exemplaires, et le prix de marché quand il
 * a été laissé de côté au profit d'un prix négocié.
 *
 * Modifiable, le montant se saisit ; sinon il se lit. Dans les deux cas, le
 * relevé de marché renvoie à la fiche du produit chez la place de marché.
 */
function CardPriceLine({
  card,
  editable,
  disabled,
  onPriceChange,
}: {
  card: TradePanelCard;
  editable: boolean;
  disabled: boolean;
  onPriceChange?: (key: string, unitPrice: number | null) => void;
}) {
  const t = useTranslations("Trade");
  const locale = useLocale();

  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(card.unitPrice?.toString() ?? "");

  // Le prix peut changer ailleurs : réponse du serveur, remise à zéro. La
  // saisie en cours fait foi tant que le champ a le focus — sinon les chiffres
  // s'effaceraient sous les doigts.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(card.unitPrice?.toString() ?? "");
    }
  }, [card.unitPrice]);

  const commit = () => {
    // La virgule décimale est celle d'une bonne partie de l'Europe : un champ
    // numérique la rend déjà en point selon le navigateur, mais un collage peut
    // la laisser passer telle quelle.
    const trimmed = text.trim().replace(",", ".");
    const value = Number.parseFloat(trimmed);

    // Un champ vidé rend la main au prix de marché ; un zéro, lui, est un prix.
    // La borne est celle du serveur : sans elle, un chiffre saisi de travers
    // afficherait un total absurde avant de faire refuser tout l'envoi.
    onPriceChange?.(
      card.key,
      trimmed === "" || !Number.isFinite(value) ? null : Math.min(TRADE_MAX_UNIT_PRICE, Math.max(0, value))
    );
  };

  const unit = appliedUnitPrice(card);
  const currency = card.marketPrice?.currency ?? DEFAULT_MARKET_CURRENCY;
  const format = (amount: number) => formatCardPrice({ amount, currency }, locale);
  // Le lien porte le nom de la place de marché : un prix ne se lit pas sans
  // savoir qui le publie, et les deux ne cotent pas la même chose le même jour.
  const market = card.marketPrice?.source;
  const marketUrl = market ? marketProductUrl(market, card.gameSlug, card.marketPrice?.productId) : undefined;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {editable ? (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min={0}
            max={TRADE_MAX_UNIT_PRICE}
            step="0.01"
            value={text}
            placeholder={card.marketPrice ? String(card.marketPrice.amount) : "—"}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            // Le prix part quand la saisie est finie, pas à chaque touche : « 1,50 »
            // s'écrit en quatre frappes, dont trois donneraient un prix de passage
            // — enregistré, et annulant au passage les validations en cours.
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
            aria-label={t("panel.unitPrice", { name: card.name })}
            className="h-7 w-20 px-2 text-xs tabular-nums"
          />
          <span className="text-[11px] text-muted-foreground">{currency}</span>
          {card.unitPrice !== undefined ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              disabled={disabled}
              onClick={() => {
                setText("");
                onPriceChange?.(card.key, null);
              }}
              aria-label={t("panel.resetPrice", { name: card.name })}
              title={t("panel.resetPrice", { name: card.name })}
            >
              <RotateCcw className="size-3" />
            </Button>
          ) : null}
        </div>
      ) : unit !== undefined ? (
        <span className="text-xs font-medium tabular-nums">{format(unit)}</span>
      ) : null}

      {unit !== undefined && card.quantity > 1 ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("panel.lineTotal", { total: format(unit * card.quantity) })}
        </span>
      ) : null}

      {unit === undefined && !editable ? (
        <span className="text-xs text-muted-foreground">{t("panel.noPrice")}</span>
      ) : null}

      {/* Le prix de marché ne se rappelle que lorsqu'un autre lui est préféré :
          sinon il est déjà là, dans le champ. */}
      {card.marketPrice && isNegotiatedPrice(card) ? (
        <span className="text-[11px] text-muted-foreground">
          {t("panel.marketPrice", { price: formatCardPrice(card.marketPrice, locale) })}
        </span>
      ) : null}

      {market && marketUrl ? (
        <a
          href={marketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          {PRICE_SOURCE_LABELS[market]}
          <ExternalLink className="size-2.5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

/** Les deux façons de voir une offre : carte à carte, ou en texte. */
type TradePanelView = "cards" | "text";

/**
 * L'offre au format texte : une carte par ligne, « 2 Nom de la carte (EXT) 123 ».
 *
 * C'est sous cette forme qu'une liste se recopie, se colle dans un message ou
 * s'importe d'ailleurs, et c'est aussi la façon la plus rapide de composer une
 * grosse offre : on écrit vingt lignes plus vite qu'on ne fait vingt
 * recherches. Un espace en lecture seule — l'offre du partenaire, un échange
 * clos — n'en garde que la lecture et la copie.
 *
 * L'appariement des noms se fait côté serveur, contre la collection ou le
 * catalogue : le navigateur n'a ni l'une ni l'autre. Rien n'est appliqué avant
 * que le joueur ne le demande, et ce qui n'a pas été reconnu est dit plutôt que
 * passé sous silence.
 */
function TradeTextView({
  cards,
  editable,
  disabled,
  scope,
  requireCardId,
  onApply,
}: {
  cards: TradePanelCard[];
  editable: boolean;
  disabled: boolean;
  /** Où chercher les cartes nommées : sa propre collection, ou le catalogue. */
  scope: TradeCardScope;
  requireCardId: boolean;
  onApply?: (entries: { card: TradeCard; quantity: number }[]) => void;
}) {
  const t = useTranslations("Trade");

  const serialized = useMemo(() => stringifyTradeCards(cards), [cards]);
  // `null` : le texte suit la liste. Dès la première frappe, c'est la saisie qui
  // fait foi, jusqu'à ce qu'elle soit appliquée ou que la liste change.
  const [draft, setDraft] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  // Ce que la dernière application a laissé de côté. Le reste est visible : ce
  // sont les cartes de l'espace, que la liste vient de remplacer.
  const [report, setReport] = useState<{ unmatched: string[]; dropped: number } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSerialized = useRef(serialized);
  const text = draft ?? serialized;

  // La liste peut changer ailleurs : une carte ajoutée par la recherche, l'offre
  // relue du serveur, la liste que l'on vient d'appliquer. Le texte la reprend
  // alors — sauf sous les doigts : une saisie en cours ne s'efface pas.
  useEffect(() => {
    if (lastSerialized.current === serialized) return;
    lastSerialized.current = serialized;
    if (document.activeElement !== textareaRef.current) setDraft(null);
  }, [serialized]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy the trade card list:", error);
    }
  };

  const apply = async () => {
    const parsed = parseTradeText(text);
    // Ce qui dépasse la taille d'une face ne sera pas retenu : autant ne pas
    // le faire chercher au serveur.
    const lines = parsed.lines.slice(0, TRADE_MAX_CARDS_PER_SIDE);
    const overflow = parsed.lines.length - lines.length;

    if (lines.length === 0) {
      // Un champ vidé vide l'offre : c'est une modification comme une autre,
      // celle qu'on ferait en retirant chaque carte. Un texte qu'on n'a pas su
      // lire, lui, n'est pas une liste vide — il est resté en travers, et
      // l'effacer emporterait à la fois l'offre et la saisie qui la corrigeait.
      if (text.trim() !== "") {
        setReport({ unmatched: parsed.ignored, dropped: 0 });
        toast.error(t("panel.text.failed"));
        return;
      }

      setReport(null);
      onApply?.([]);
      setDraft(null);
      toast.success(t("panel.text.applied", { count: 0 }));
      return;
    }

    setApplying(true);
    try {
      const response = await fetch("/api/trades/cards/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          cards: lines.map(({ name, setCode, collectorNumber }) => ({ name, setCode, collectorNumber })),
        }),
      });

      if (!response.ok) {
        toast.error(t("panel.text.failed"));
        return;
      }

      const data: { matches?: (TradeCard | null)[] } = await response.json();
      const matches = data.matches ?? [];

      const applied = applyTradeText(lines, (_line, index) => {
        const card = matches[index];
        if (!card) return undefined;
        // Une contrepartie libre demande des cartes au catalogue : une entrée de
        // collection qu'il ne connaît pas ne peut pas être demandée.
        if (requireCardId && !card.cardId) return undefined;
        return card;
      });

      setReport({
        unmatched: [...applied.unmatched, ...parsed.ignored],
        dropped: applied.dropped + overflow,
      });

      // Même raison qu'une liste illisible : une liste dont pas une ligne n'a
      // trouvé sa carte ne vaut pas un espace vide. Elle reste à corriger, avec
      // sous les yeux ce qui n'a pas été reconnu.
      if (applied.entries.length === 0) {
        toast.error(t("panel.text.noMatch"));
        return;
      }

      onApply?.(applied.entries);
      setDraft(null);
      toast.success(t("panel.text.applied", { count: applied.entries.length }));
    } catch (error) {
      console.error("Failed to apply the trade card list:", error);
      toast.error(t("panel.text.failed"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={textareaRef}
        value={text}
        readOnly={!editable}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        rows={10}
        maxLength={10000}
        spellCheck={false}
        aria-label={t("panel.text.label")}
        placeholder={t("panel.text.placeholder")}
        className="field-sizing-fixed font-mono text-[13px] leading-[22px]"
      />
      <p className="text-xs text-muted-foreground">{editable ? t("panel.text.hint") : t("panel.text.readOnly")}</p>

      {report && report.unmatched.length > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("panel.text.unmatched", {
            count: report.unmatched.length,
            lines: report.unmatched.slice(0, 5).join(" · ") + (report.unmatched.length > 5 ? " …" : ""),
          })}
        </p>
      ) : null}
      {report && report.dropped > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("panel.text.dropped", { count: report.dropped, max: TRADE_MAX_CARDS_PER_SIDE })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={disabled || applying}
            onClick={() => void apply()}
          >
            {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t("panel.text.apply")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!text}
          onClick={() => void copy()}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t("panel.text.copied") : t("panel.text.copy")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Un des deux espaces de l'interface d'échange : les cartes retenues et, quand
 * l'espace est modifiable, la recherche permettant d'en ajouter (dans la
 * collection ou dans tout le catalogue). Les mêmes cartes se lisent et se
 * modifient au format texte, d'un bouton.
 *
 * L'offre du partenaire est affichée avec le même composant en lecture seule.
 */
export default function TradePanel({
  title,
  subtitle,
  cards,
  emptyLabel,
  editable,
  requireOwned = false,
  requireCardId = false,
  defaultScope,
  games,
  disabled = false,
  refreshKey = 0,
  saving = false,
  badge,
  onAdd,
  onQuantityChange,
  onPriceChange,
  onRemove,
  onApplyText,
}: {
  title: string;
  subtitle: string;
  cards: TradePanelCard[];
  emptyLabel: string;
  editable: boolean;
  /** Vrai pour sa propre offre : une carte non possédée n'est pas proposable. */
  requireOwned?: boolean;
  /** Vrai pour une contrepartie libre : la carte doit être connue du catalogue. */
  requireCardId?: boolean;
  defaultScope: TradeCardScope;
  games: TradeGame[];
  disabled?: boolean;
  /** Incrémenté après un échange pour relancer la recherche (les quantités possédées ont changé). */
  refreshKey?: number;
  saving?: boolean;
  badge?: ReactNode;
  onAdd?: (card: TradeCard) => void;
  onQuantityChange?: (key: string, quantity: number) => void;
  onPriceChange?: (key: string, unitPrice: number | null) => void;
  onRemove?: (key: string) => void;
  /** Remplace le contenu de l'espace par une liste écrite au format texte. */
  onApplyText?: (entries: { card: TradeCard; quantity: number }[]) => void;
}) {
  const t = useTranslations("Trade");
  const locale = useLocale();

  const [view, setView] = useState<TradePanelView>("cards");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<TradeCardScope>(defaultScope);
  const [gameId, setGameId] = useState(ALL_GAMES);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TradeCardSearchResult | null>(null);
  const [loading, setLoading] = useState(editable);

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editable) return;

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ scope, page: String(page), limit: "12" });
        if (query.trim()) params.set("q", query.trim());
        if (gameId !== ALL_GAMES) params.set("gameId", gameId);

        const res = await fetch(`/api/trades/cards?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data: TradeCardSearchResult = await res.json();
        if (controller.signal.aborted) return;
        setResult(data);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Failed to search cards:", error);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    }, query.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, scope, gameId, page, refreshKey, editable]);

  // Tout changement de filtre repart de la première page.
  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const updateScope = (value: TradeCardScope) => {
    setScope(value);
    setPage(1);
  };
  const updateGame = (value: string) => {
    setGameId(value);
    setPage(1);
  };

  const items = result?.items ?? [];
  const totalPages = result?.totalPages ?? 1;
  const cardsByKey = new Map(cards.map((card) => [card.key, card]));

  /** Une carte n'est ajoutable que si l'espace peut réellement l'accueillir. */
  const blockedReason = (card: TradeCard): string | null => {
    if (requireOwned && card.owned <= 0) return t("panel.notOwned");
    if (requireCardId && !card.cardId) return t("panel.notInCatalog");
    if (requireOwned && (cardsByKey.get(card.key)?.quantity ?? 0) >= card.owned) {
      return t("panel.allCopiesSelected");
    }
    return null;
  };

  const totalCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  const total = sideTotal(cards, DEFAULT_MARKET_CURRENCY);

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {badge}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
            {t("panel.copies", { count: totalCopies })}
          </span>
          {/* Les mêmes cartes, vues autrement : la liste, ou le texte. */}
          <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
            <ViewButton
              active={view === "cards"}
              label={t("panel.viewCards")}
              onClick={() => setView("cards")}
            >
              <List className="size-3.5" />
            </ViewButton>
            <ViewButton active={view === "text"} label={t("panel.viewText")} onClick={() => setView("text")}>
              <FileText className="size-3.5" />
            </ViewButton>
          </div>
        </div>
      </header>

      {view === "text" ? (
        <TradeTextView
          cards={cards}
          editable={editable}
          disabled={disabled}
          // Une offre se compose de ce que l'on possède, une contrepartie libre
          // de ce que le catalogue connaît : la face décide où chercher, pas le
          // filtre de la recherche.
          scope={requireOwned ? "collection" : "catalog"}
          requireCardId={requireCardId}
          onApply={onApplyText}
        />
      ) : null}

      {/* Cartes retenues. La vue texte les masque sans les démonter : la
          recherche garde ses résultats et sa page d'un aller-retour à l'autre. */}
      <div className={view === "cards" ? "flex flex-col gap-2" : "hidden"}>
        {cards.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          cards.map((card) => (
            <div key={card.key} className="flex items-center gap-3 rounded-lg border bg-background p-2">
              <CardThumb image={card.image} name={card.name} orientation={card.orientation} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight" title={card.name}>
                  {card.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {card.setCode} #{card.collectorNumber}
                  {card.gameName ? ` · ${card.gameName}` : ""}
                </p>
                <CardPriceLine
                  card={card}
                  editable={editable}
                  disabled={disabled}
                  onPriceChange={onPriceChange}
                />
              </div>
              {editable ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-7"
                    disabled={disabled || card.quantity <= 1}
                    onClick={() => onQuantityChange?.(card.key, card.quantity - 1)}
                    aria-label={t("panel.decrease", { name: card.name })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{card.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-7"
                    disabled={disabled || card.quantity >= card.maxQuantity}
                    onClick={() => onQuantityChange?.(card.key, card.quantity + 1)}
                    aria-label={t("panel.increase", { name: card.name })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() => onRemove?.(card.key)}
                    aria-label={t("panel.remove", { name: card.name })}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <span className="shrink-0 text-sm font-semibold tabular-nums">×{card.quantity}</span>
              )}
            </div>
          ))
        )}

        {cards.length > 0 ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t pt-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("panel.total")}
            </span>
            {/* Ce qui n'a pas de prix ne vaut pas zéro : le total dit ce qu'il
                laisse dehors, sans quoi deux offres se compareraient sur des
                bases différentes sans que rien ne le signale. */}
            {total.unpricedCopies > 0 ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {t("panel.unpriced", { count: total.unpricedCopies })}
              </span>
            ) : null}
            <span className="ml-auto text-base font-bold tabular-nums">
              {total.currency
                ? formatCardPrice({ amount: total.amount, currency: total.currency }, locale)
                : t("panel.noTotal")}
            </span>
          </div>
        ) : null}
      </div>

      {/* Recherche */}
      {editable ? (
        <div className={view === "cards" ? "flex flex-col gap-2 border-t pt-4" : "hidden"}>
          <div className="inline-flex w-fit items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => updateScope("collection")}
              aria-pressed={scope === "collection"}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                scope === "collection" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("panel.scopeCollection")}
            </button>
            <button
              type="button"
              onClick={() => updateScope("catalog")}
              aria-pressed={scope === "catalog"}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                scope === "catalog" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("panel.scopeCatalog")}
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder={t("panel.searchPlaceholder")}
                className="pl-9"
              />
            </div>
            {games.length > 0 ? (
              <Select value={gameId} onValueChange={updateGame}>
                <SelectTrigger className="sm:w-[170px]">
                  <SelectValue placeholder={t("panel.allGames")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_GAMES}>{t("panel.allGames")}</SelectItem>
                  {games.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div className="flex min-h-5 items-center justify-between text-xs text-muted-foreground">
            <span>{result?.needsQuery ? null : t("panel.results", { count: result?.total ?? 0 })}</span>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          </div>

          {items.length === 0 && !loading ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {result?.needsQuery
                ? t("panel.typeToSearch")
                : scope === "collection" && !query.trim() && gameId === ALL_GAMES
                  ? t("panel.emptyCollection")
                  : t("panel.noResults")}
            </p>
          ) : (
            <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
              {items.map((card) => {
                const reason = blockedReason(card);
                const inSelection = cardsByKey.has(card.key);
                return (
                  <li key={`${card.key}|${card.cardId ?? ""}`} className="flex items-center gap-3 rounded-lg border p-2">
                    <CardThumb image={card.image} name={card.name} orientation={card.orientation} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight" title={card.name}>
                          {card.name}
                        </p>
                        {/* Le prix aide à choisir ce qu'on met dans l'offre,
                            avant même de l'y ajouter. */}
                        <CardPriceTag price={card.marketPrice} gameSlug={card.gameSlug} className="text-[11px]" />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {card.setCode} #{card.collectorNumber}
                        {card.gameName ? ` · ${card.gameName}` : ""}
                      </p>
                      {card.owned > 0 ? (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {t("panel.owned", { count: card.owned })}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant={inSelection ? "secondary" : "outline"}
                      size="sm"
                      className="gap-1.5"
                      disabled={disabled || reason !== null}
                      title={reason ?? undefined}
                      onClick={() => onAdd?.(card)}
                    >
                      {inSelection ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      {t("panel.add")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t("panel.previous")}
              </Button>
              <span className="text-xs text-muted-foreground">{t("panel.pageOf", { page, totalPages })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {t("panel.next")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Un des deux boutons du sélecteur de vue, dans l'en-tête de l'espace. */
function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      aria-label={label}
      className={`rounded-md px-2 py-1 transition-colors ${
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CardThumb({ image, name, orientation }: { image: string; name: string; orientation?: CardOrientation }) {
  if (!image) {
    return <div className="h-16 w-12 shrink-0 rounded bg-muted" aria-hidden />;
  }

  return (
    <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-muted">
      <CardImage
        src={image}
        alt={name}
        orientation={orientation}
        frame="12/16"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
