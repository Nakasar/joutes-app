"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  Library,
  Loader2,
  Trash2,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TRADE_MAX_QUANTITY } from "@/lib/constants/trade";
import TradePanel, { TradePanelCard } from "../TradePanel";
import TradeInviteDialog from "./TradeInviteDialog";
import { UserBadges } from "@/components/UserBadges";
import type { PublicUser } from "@/lib/db/users";
import type { Trade, TradeCard, TradeCardSnapshot, TradeGame } from "@/lib/db/trades";
import { sideTotal, tradeDifference } from "@/lib/trade/pricing";
import { formatCardPrice } from "@/lib/prices/display";
import { CARDMARKET_CURRENCY } from "@/lib/prices/cardmarket";

type OfferTarget = "mine" | "counterparty";

const POLL_INTERVAL_MS = 5000;
const SAVE_DEBOUNCE_MS = 400;

function userLabel(user: PublicUser): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

function cardKeyOf(card: { name: string; setCode: string; collectorNumber: string }): string {
  return `${card.name}|${card.setCode}|${card.collectorNumber}`;
}

const TARGETS: OfferTarget[] = ["mine", "counterparty"];

/**
 * Convertit une offre serveur en cartes affichables. `hints` porte les
 * exemplaires possédés vus en recherche : à défaut, le plafond est la borne
 * d'échange et c'est le serveur qui tranche à l'enregistrement.
 */
function toPanelCards(
  cards: TradeCardSnapshot[],
  hints: Map<string, number>,
  capToOwned: boolean
): TradePanelCard[] {
  return cards.map((card) => {
    const key = cardKeyOf(card);
    return {
      key,
      cardId: card.cardId,
      name: card.name,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      image: card.image,
      gameName: card.gameName,
      gameSlug: card.gameSlug,
      quantity: card.quantity,
      maxQuantity: capToOwned ? hints.get(key) ?? TRADE_MAX_QUANTITY : TRADE_MAX_QUANTITY,
      marketPrice: card.marketPrice,
      unitPrice: card.unitPrice,
    };
  });
}

function sidesFor(trade: Trade, currentUserId: string) {
  const mine = trade.sides.find((side) => side.user?.id === currentUserId) ?? trade.sides[0];
  const other = trade.sides.find((side) => side.id !== mine.id) ?? trade.sides[1];
  return { mine, other };
}

/**
 * Interface d'un échange : « mon offre » à gauche, l'offre d'en face à droite.
 *
 * Sans partenaire, la face de droite est libre et décrit ce que l'utilisateur
 * reçoit (échange enregistré en main propre) : la valider applique l'échange
 * immédiatement. Avec un partenaire, elle lui appartient et devient une lecture
 * seule rafraîchie régulièrement : l'échange s'applique quand les deux joueurs
 * ont validé.
 */
export default function TradeEditor({
  initialTrade,
  currentUserId,
  games,
}: {
  initialTrade: Trade;
  currentUserId: string;
  games: TradeGame[];
}) {
  const t = useTranslations("Trade");
  const locale = useLocale();
  const router = useRouter();

  const [trade, setTrade] = useState<Trade>(initialTrade);
  const [drafts, setDrafts] = useState<Record<OfferTarget, TradePanelCard[]>>(() => {
    const { mine, other } = sidesFor(initialTrade, currentUserId);
    return {
      mine: toPanelCards(mine.cards, new Map(), true),
      counterparty: toPanelCards(other.cards, new Map(), false),
    };
  });
  const [saving, setSaving] = useState<Record<OfferTarget, boolean>>({ mine: false, counterparty: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [partnerRemovalOpen, setPartnerRemovalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Plafonds de quantité connus (exemplaires possédés vus en recherche) : ils ne
  // sont pas stockés dans l'offre, le serveur restant l'autorité en la matière.
  const ownedHints = useRef<Map<string, number>>(new Map());
  // Révision serveur à jour, y compris juste après un enregistrement d'offre :
  // c'est elle qu'on valide, pas celle du dernier rendu.
  const revisionRef = useRef(initialTrade.revision);
  const draftsRef = useRef(drafts);
  const dirtyRef = useRef<Record<OfferTarget, boolean>>({ mine: false, counterparty: false });
  const inFlightRef = useRef<Record<OfferTarget, boolean>>({ mine: false, counterparty: false });
  const timersRef = useRef<Partial<Record<OfferTarget, number>>>({});

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const { mine: mySide, other: otherSide } = sidesFor(trade, currentUserId);
  const partner = otherSide.user;
  const isOpen = trade.status === "open";
  const isCreator = trade.createdBy === currentUserId;
  const myValidated = !!mySide.validatedAt;
  const partnerValidated = !!otherSide.validatedAt;

  /**
   * Reprend l'état serveur. Les brouillons d'une face en cours d'édition ne sont
   * pas écrasés : c'est l'édition locale qui fait foi jusqu'à son envoi.
   */
  const applyServerTrade = useCallback(
    (next: Trade) => {
      setTrade(next);
      revisionRef.current = next.revision;

      const { mine: nextMine, other: nextOther } = sidesFor(next, currentUserId);

      setDrafts((current) => ({
        mine:
          dirtyRef.current.mine || inFlightRef.current.mine
            ? current.mine
            : toPanelCards(nextMine.cards, ownedHints.current, true),
        counterparty:
          dirtyRef.current.counterparty || inFlightRef.current.counterparty
            ? current.counterparty
            : toPanelCards(nextOther.cards, ownedHints.current, false),
      }));
    },
    [currentUserId]
  );

  const flush = useCallback(
    async (target: OfferTarget) => {
      if (inFlightRef.current[target]) return;

      dirtyRef.current[target] = false;
      inFlightRef.current[target] = true;
      setSaving((current) => ({ ...current, [target]: true }));

      try {
        const draft = draftsRef.current[target];
        const cards =
          target === "mine"
            ? draft.map((card) => ({
                name: card.name,
                setCode: card.setCode,
                collectorNumber: card.collectorNumber,
                quantity: card.quantity,
                unitPrice: card.unitPrice ?? null,
              }))
            : draft
                .filter((card) => card.cardId)
                .map((card) => ({
                  cardId: card.cardId as string,
                  quantity: card.quantity,
                  unitPrice: card.unitPrice ?? null,
                }));

        const res = await fetch(`/api/trades/${trade.id}/offer`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, cards }),
        });
        const data: { trade?: Trade; error?: string } = await res.json().catch(() => ({}));

        // Le drapeau tombe avant l'application : sinon l'état renvoyé par le
        // serveur (quantités bornées aux exemplaires possédés, cartes écartées)
        // serait considéré comme concurrent de l'envoi et jamais repris. Une
        // modification arrivée entre-temps garde la main via `dirtyRef`.
        inFlightRef.current[target] = false;

        if (!res.ok) {
          toast.error(data.error === "closed" ? t("errors.closed") : t("errors.saveFailed"));
          if (data.trade) applyServerTrade(data.trade);
          return;
        }

        if (data.trade) applyServerTrade(data.trade);
      } catch (error) {
        console.error("Failed to save the trade offer:", error);
        toast.error(t("errors.saveFailed"));
      } finally {
        inFlightRef.current[target] = false;
        setSaving((current) => ({ ...current, [target]: false }));
        // Une modification est arrivée pendant l'envoi : on renvoie l'état frais.
        if (dirtyRef.current[target]) void flush(target);
      }
    },
    [trade.id, applyServerTrade, t]
  );

  const scheduleSave = useCallback(
    (target: OfferTarget) => {
      dirtyRef.current[target] = true;
      window.clearTimeout(timersRef.current[target]);
      timersRef.current[target] = window.setTimeout(() => void flush(target), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  // Rafraîchissement de l'offre du partenaire et des validations.
  useEffect(() => {
    if (!isOpen || !partner) return;

    const interval = window.setInterval(async () => {
      const busyWriting =
        dirtyRef.current.mine ||
        dirtyRef.current.counterparty ||
        inFlightRef.current.mine ||
        inFlightRef.current.counterparty;
      if (busyWriting) return;

      try {
        const res = await fetch(`/api/trades/${trade.id}`);
        if (!res.ok) return;
        const data: { trade?: Trade } = await res.json();
        if (data.trade) applyServerTrade(data.trade);
      } catch {
        // Rafraîchissement best-effort : la prochaine passe réessaiera.
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isOpen, partner, trade.id, applyServerTrade]);

  const updateDraft = (target: OfferTarget, next: TradePanelCard[]) => {
    setDrafts((current) => ({ ...current, [target]: next }));
    scheduleSave(target);
  };

  const addCard = (target: OfferTarget, card: TradeCard) => {
    if (target === "mine") {
      ownedHints.current.set(card.key, card.owned);
    }
    const max = target === "mine" ? Math.max(1, card.owned) : TRADE_MAX_QUANTITY;
    const draft = draftsRef.current[target];
    const existing = draft.find((item) => item.key === card.key);

    const next = existing
      ? draft.map((item) =>
          item.key === card.key
            ? { ...item, quantity: Math.min(max, item.quantity + 1), maxQuantity: max }
            : item
        )
      : [
          ...draft,
          {
            key: card.key,
            cardId: card.cardId,
            name: card.name,
            setCode: card.setCode,
            collectorNumber: card.collectorNumber,
            image: card.image,
            gameName: card.gameName,
            gameSlug: card.gameSlug,
            quantity: 1,
            maxQuantity: max,
            marketPrice: card.marketPrice,
          },
        ];

    updateDraft(target, next);
  };

  const changeQuantity = (target: OfferTarget, key: string, quantity: number) => {
    updateDraft(
      target,
      draftsRef.current[target].map((card) =>
        card.key === key
          ? { ...card, quantity: Math.max(1, Math.min(card.maxQuantity, quantity)) }
          : card
      )
    );
  };

  /**
   * Prix décidé pour une carte, à l'unité. `null` l'efface : la carte revient
   * au prix de marché, qui reste la référence commune des deux faces.
   */
  const changePrice = (target: OfferTarget, key: string, unitPrice: number | null) => {
    updateDraft(
      target,
      draftsRef.current[target].map((card) =>
        card.key === key ? { ...card, unitPrice: unitPrice === null ? undefined : Math.max(0, unitPrice) } : card
      )
    );
  };

  const removeCard = (target: OfferTarget, key: string) => {
    updateDraft(
      target,
      draftsRef.current[target].filter((card) => card.key !== key)
    );
  };

  /**
   * Envoie les modifications encore en attente avant une action décisive, et
   * attend les envois déjà en cours : la validation porte sur la révision issue
   * de ces enregistrements.
   */
  const flushPending = async () => {
    for (const target of TARGETS) {
      window.clearTimeout(timersRef.current[target]);
    }

    // Borné : au pire on valide avec la dernière révision connue et le serveur
    // répond « conflict », que l'appelant traite déjà.
    for (let attempt = 0; attempt < 40; attempt++) {
      const writing = TARGETS.filter((target) => inFlightRef.current[target]);
      const pending = TARGETS.filter((target) => dirtyRef.current[target]);

      if (writing.length === 0 && pending.length === 0) return;
      if (writing.length === 0) {
        await Promise.all(pending.map((target) => flush(target)));
        continue;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  };

  const validate = async () => {
    setBusy(true);
    try {
      await flushPending();

      const res = await fetch(`/api/trades/${trade.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Révision d'après l'envoi des offres en attente : on ne valide pas un
        // contenu modifié depuis, mais on n'invalide pas sa propre sauvegarde.
        body: JSON.stringify({ revision: revisionRef.current }),
      });
      const data: {
        trade?: Trade;
        applied?: boolean;
        error?: string;
        details?: { name?: string }[];
      } = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.error === "conflict") {
          toast.error(t("errors.changed"));
        } else if (data.error === "insufficient-copies") {
          const names = (data.details ?? []).map((detail) => detail.name).filter(Boolean).join(", ");
          toast.error(t("errors.insufficientCopies", { cards: names }));
        } else if (data.error === "empty") {
          toast.error(t("errors.empty"));
        } else if (data.error === "closed") {
          toast.error(t("errors.closed"));
        } else {
          toast.error(t("errors.failed"));
        }
        if (data.trade) applyServerTrade(data.trade);
        return;
      }

      if (data.trade) applyServerTrade(data.trade);
      setConfirmOpen(false);

      if (data.applied) {
        toast.success(t("success"));
        setRefreshKey((current) => current + 1);
      } else {
        toast.success(t("validation.saved"));
      }
    } catch (error) {
      console.error("Failed to validate the trade:", error);
      toast.error(t("errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const revokeValidation = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}/validate`, { method: "DELETE" });
      const data: { trade?: Trade } = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(t("errors.failed"));
        return;
      }
      if (data.trade) applyServerTrade(data.trade);
    } catch (error) {
      console.error("Failed to revoke the trade validation:", error);
      toast.error(t("errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelTrade = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: "DELETE" });
      const data: { trade?: Trade } = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(t("errors.failed"));
        return;
      }
      if (data.trade) applyServerTrade(data.trade);
      setCancelOpen(false);
      toast.success(t("cancel.done"));
    } catch (error) {
      console.error("Failed to cancel the trade:", error);
      toast.error(t("errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const removePartner = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}/partner`, { method: "DELETE" });
      const data: { trade?: Trade } = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(t("errors.failed"));
        return;
      }
      if (data.trade) applyServerTrade(data.trade);
      setPartnerRemovalOpen(false);
      // Le partenaire qui quitte n'est plus participant : retour à la liste.
      if (!isCreator) {
        router.push("/trade");
        return;
      }
      toast.success(t("partner.removed"));
    } catch (error) {
      console.error("Failed to remove the trade partner:", error);
      toast.error(t("errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const myCopies = drafts.mine.reduce((sum, card) => sum + card.quantity, 0);
  const receivedCopies = drafts.counterparty.reduce((sum, card) => sum + card.quantity, 0);

  // Les deux faces se chiffrent avec la même règle : prix décidé, à défaut prix
  // de marché, et ce qui n'a pas de prix reste dehors (cf. lib/trade/pricing.ts).
  const myTotal = sideTotal(drafts.mine, CARDMARKET_CURRENCY);
  const theirTotal = sideTotal(drafts.counterparty, CARDMARKET_CURRENCY);
  const difference = tradeDifference(myTotal, theirTotal);
  const differenceCurrency = myTotal.currency ?? theirTotal.currency;
  const unpricedCopies = myTotal.unpricedCopies + theirTotal.unpricedCopies;
  const money = (amount: number) =>
    formatCardPrice({ amount, currency: differenceCurrency ?? CARDMARKET_CURRENCY, updatedAt: "" }, locale);
  const canValidate = isOpen && !busy && (drafts.mine.length > 0 || drafts.counterparty.length > 0);
  const partnerName = partner ? userLabel(partner) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/trade"
            className="mb-1 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftRight className="size-4" />
            {t("backToList")}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {partnerName ? t("withPartner", { name: partnerName }) : t("noPartner")}
            <UserBadges badges={partner?.badges} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOpen && !partner ? (
            <TradeInviteDialog
              tradeId={trade.id}
              code={trade.code}
              disabled={busy}
              onTradeChange={applyServerTrade}
            />
          ) : null}
          {isOpen && partner ? (
            <Button variant="outline" className="gap-2" disabled={busy} onClick={() => setPartnerRemovalOpen(true)}>
              <UserMinus className="size-4" />
              {isCreator ? t("partner.remove") : t("partner.leave")}
            </Button>
          ) : null}
          {isOpen ? (
            <Button variant="outline" className="gap-2" disabled={busy} onClick={() => setCancelOpen(true)}>
              <Trash2 className="size-4" />
              {t("cancel.button")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Bandeau d'état pour un échange terminé */}
      {trade.status === "completed" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
            {t("status.completed")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/collection">
                <Library className="size-4" />
                {t("backToCollection")}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
      {trade.status === "cancelled" ? (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Ban className="size-5" />
          {t("status.cancelled")}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TradePanel
          title={t("offer.title")}
          subtitle={t("offer.subtitle")}
          cards={drafts.mine}
          emptyLabel={t("panel.emptyOffer")}
          editable={isOpen}
          requireOwned
          defaultScope="collection"
          games={games}
          disabled={busy}
          refreshKey={refreshKey}
          saving={saving.mine}
          badge={myValidated ? <ValidatedBadge label={t("validation.mine")} /> : null}
          onAdd={(card) => addCard("mine", card)}
          onQuantityChange={(key, quantity) => changeQuantity("mine", key, quantity)}
          onPriceChange={(key, unitPrice) => changePrice("mine", key, unitPrice)}
          onRemove={(key) => removeCard("mine", key)}
        />
        <TradePanel
          title={partnerName ? t("request.titleWithPartner", { name: partnerName }) : t("request.title")}
          subtitle={partner ? t("request.subtitlePartner") : t("request.subtitle")}
          cards={drafts.counterparty}
          emptyLabel={partner ? t("panel.emptyPartner") : t("panel.emptyRequest")}
          // Dès qu'un partenaire occupe la face, elle lui appartient.
          editable={isOpen && !partner}
          requireCardId
          defaultScope="catalog"
          games={games}
          disabled={busy}
          refreshKey={refreshKey}
          saving={saving.counterparty}
          badge={partnerValidated ? <ValidatedBadge label={t("validation.partner")} /> : null}
          onAdd={(card) => addCard("counterparty", card)}
          onQuantityChange={(key, quantity) => changeQuantity("counterparty", key, quantity)}
          onPriceChange={(key, unitPrice) => changePrice("counterparty", key, unitPrice)}
          onRemove={(key) => removeCard("counterparty", key)}
        />
      </div>

      {/* Écart entre les deux offres. Il n'a de sens que si quelque chose est
          chiffré des deux côtés : sinon il ne dirait que le total d'une face. */}
      {differenceCurrency && (myTotal.pricedCopies > 0 || theirTotal.pricedCopies > 0) ? (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-xl border bg-card p-4">
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("value.mine")}</span>
            <span className="text-lg font-semibold tabular-nums">{money(myTotal.amount)}</span>
          </div>
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("value.theirs")}</span>
            <span className="text-lg font-semibold tabular-nums">{money(theirTotal.amount)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("value.difference")}</span>
            <span
              className={`text-lg font-bold tabular-nums ${
                difference === 0
                  ? ""
                  : difference > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {difference > 0 ? "+" : ""}
              {money(difference)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {difference === 0
                ? t("value.balanced")
                : difference > 0
                  ? t("value.inTheirFavor")
                  : t("value.inMyFavor")}
            </span>
          </div>
          {unpricedCopies > 0 ? (
            <p className="w-full text-center text-[11px] text-amber-600 dark:text-amber-400">
              {t("value.unpriced", { count: unpricedCopies })}
            </p>
          ) : null}
        </div>
      ) : null}

      {isOpen ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
          <div className="text-sm text-muted-foreground">
            <p>{t("summary", { offered: myCopies, received: receivedCopies })}</p>
            {partner ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                <Clock className="size-3.5" />
                {myValidated
                  ? partnerValidated
                    ? t("validation.finalizing")
                    : t("validation.waitingPartner", { name: partnerName ?? "" })
                  : partnerValidated
                    ? t("validation.partnerReady", { name: partnerName ?? "" })
                    : t("validation.hint")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {myValidated ? (
              <Button variant="outline" className="gap-2" disabled={busy} onClick={() => void revokeValidation()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                {t("validation.revoke")}
              </Button>
            ) : (
              <Button className="gap-2" disabled={!canValidate} onClick={() => setConfirmOpen(true)}>
                <ArrowLeftRight className="size-4" />
                {partner ? t("validation.validate") : t("trade")}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Confirmation : récapitulatif des deux faces avant écriture */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirm.title")}</DialogTitle>
            <DialogDescription>
              {partner && !partnerValidated ? t("confirm.descriptionPartner") : t("confirm.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <ConfirmColumn
              title={t("confirm.given")}
              emptyLabel={t("confirm.none")}
              cards={drafts.mine}
              tone="destructive"
            />
            <ConfirmColumn
              title={t("confirm.received")}
              emptyLabel={t("confirm.none")}
              cards={drafts.counterparty}
              tone="positive"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>
              {t("confirm.cancel")}
            </Button>
            <Button className="gap-2" disabled={busy} onClick={() => void validate()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {partner && !partnerValidated ? t("validation.validate") : t("confirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("cancel.title")}
        description={t("cancel.description")}
        confirmLabel={t("cancel.confirm")}
        cancelLabel={t("confirm.cancel")}
        destructive
        busy={busy}
        onConfirm={() => void cancelTrade()}
      />

      <ConfirmDialog
        open={partnerRemovalOpen}
        onOpenChange={setPartnerRemovalOpen}
        title={isCreator ? t("partner.removeTitle") : t("partner.leaveTitle")}
        description={isCreator ? t("partner.removeDescription") : t("partner.leaveDescription")}
        confirmLabel={isCreator ? t("partner.remove") : t("partner.leave")}
        cancelLabel={t("confirm.cancel")}
        destructive
        busy={busy}
        onConfirm={() => void removePartner()}
      />
    </div>
  );
}

function ValidatedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
      <BadgeCheck className="size-3.5" />
      {label}
    </span>
  );
}

function ConfirmColumn({
  title,
  emptyLabel,
  cards,
  tone,
}: {
  title: string;
  emptyLabel: string;
  cards: TradePanelCard[];
  tone: "destructive" | "positive";
}) {
  const t = useTranslations("Trade");
  const locale = useLocale();
  // La confirmation est le dernier moment pour se rendre compte de ce que
  // l'échange pèse : le total y est repris, avec les mêmes règles qu'ailleurs.
  const total = sideTotal(cards, CARDMARKET_CURRENCY);

  return (
    <div className="rounded-lg border p-3">
      <p
        className={`mb-2 text-sm font-semibold ${
          tone === "destructive" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {title}
      </p>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {cards.map((card) => (
            <li key={card.key} className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={card.name}>
                {card.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {card.setCode} #{card.collectorNumber}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">×{card.quantity}</span>
            </li>
          ))}
        </ul>
      )}
      {total.currency ? (
        <p className="mt-2 flex items-baseline justify-between gap-2 border-t pt-2 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("panel.total")}</span>
          <span className="font-bold tabular-nums">
            {formatCardPrice({ amount: total.amount, currency: total.currency, updatedAt: "" }, locale)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
