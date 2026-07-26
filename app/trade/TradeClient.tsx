"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftRight, ArrowRight, Library, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TradePanel, { TradeSelection } from "./TradePanel";
import type { TradeCard, TradeGame } from "@/lib/db/trades";

const MAX_QUANTITY = 99;

/**
 * Interface d'échange : « mon offre » à gauche (cartes cédées, recherchées par
 * défaut dans la collection), cartes reçues à droite (recherchées par défaut
 * dans tout le catalogue). La validation retire les premières de la collection
 * et y ajoute les secondes.
 */
export default function TradeClient({ games }: { games: TradeGame[] }) {
  const t = useTranslations("Trade");

  const [offer, setOffer] = useState<TradeSelection[]>([]);
  const [request, setRequest] = useState<TradeSelection[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const addTo = (
    setSelection: React.Dispatch<React.SetStateAction<TradeSelection[]>>,
    card: TradeCard,
    max: number
  ) => {
    setSelection((current) => {
      const existing = current.find((item) => item.key === card.key);
      if (!existing) {
        return [...current, { ...card, quantity: 1 }];
      }
      // Les données de la carte sont rafraîchies au passage (exemplaires possédés).
      return current.map((item) =>
        item.key === card.key ? { ...card, quantity: Math.min(max, item.quantity + 1) } : item
      );
    });
  };

  const changeQuantity = (
    setSelection: React.Dispatch<React.SetStateAction<TradeSelection[]>>,
    key: string,
    quantity: number,
    maxOf: (card: TradeSelection) => number
  ) => {
    setSelection((current) =>
      current.map((item) =>
        item.key === key ? { ...item, quantity: Math.max(1, Math.min(maxOf(item), quantity)) } : item
      )
    );
  };

  const removeFrom = (setSelection: React.Dispatch<React.SetStateAction<TradeSelection[]>>, key: string) => {
    setSelection((current) => current.filter((item) => item.key !== key));
  };

  const offeredCopies = offer.reduce((sum, card) => sum + card.quantity, 0);
  const receivedCopies = request.reduce((sum, card) => sum + card.quantity, 0);
  const canTrade = offer.length > 0 || request.length > 0;

  const submitTrade = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offered: offer.map((card) => ({
            name: card.name,
            setCode: card.setCode,
            collectorNumber: card.collectorNumber,
            quantity: card.quantity,
          })),
          // Le serveur relit les données de la carte au catalogue à partir de cet id.
          received: request
            .filter((card) => card.cardId)
            .map((card) => ({ cardId: card.cardId as string, quantity: card.quantity })),
        }),
      });

      if (!res.ok) {
        const data: { error?: string; details?: { name?: string }[] } = await res.json().catch(() => ({}));
        if (res.status === 409 && data.error === "insufficient-copies") {
          const names = (data.details ?? []).map((detail) => detail.name).filter(Boolean).join(", ");
          toast.error(t("errors.insufficientCopies", { cards: names }));
        } else {
          toast.error(t("errors.failed"));
        }
        return;
      }

      const data: { removed: number; added: number } = await res.json();
      toast.success(t("success", { removed: data.removed, added: data.added }));
      setOffer([]);
      setRequest([]);
      setConfirmOpen(false);
      // Les quantités possédées ont changé : les deux recherches sont relancées.
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error("Failed to execute trade:", error);
      toast.error(t("errors.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ArrowLeftRight className="size-7 text-primary" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/collection">
            <Library className="size-4" />
            {t("backToCollection")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TradePanel
          side="offer"
          title={t("offer.title")}
          subtitle={t("offer.subtitle")}
          defaultScope="collection"
          games={games}
          selected={offer}
          disabled={submitting}
          refreshKey={refreshKey}
          onAdd={(card) => addTo(setOffer, card, Math.max(1, card.owned))}
          onQuantityChange={(key, quantity) =>
            changeQuantity(setOffer, key, quantity, (card) => Math.max(1, card.owned))
          }
          onRemove={(key) => removeFrom(setOffer, key)}
        />
        <TradePanel
          side="request"
          title={t("request.title")}
          subtitle={t("request.subtitle")}
          defaultScope="catalog"
          games={games}
          selected={request}
          disabled={submitting}
          refreshKey={refreshKey}
          onAdd={(card) => addTo(setRequest, card, MAX_QUANTITY)}
          onQuantityChange={(key, quantity) => changeQuantity(setRequest, key, quantity, () => MAX_QUANTITY)}
          onRemove={(key) => removeFrom(setRequest, key)}
        />
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {t("summary", { offered: offeredCopies, received: receivedCopies })}
        </p>
        <Button className="gap-2" disabled={!canTrade || submitting} onClick={() => setConfirmOpen(true)}>
          <ArrowLeftRight className="size-4" />
          {t("trade")}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          // La modale reste ouverte le temps de l'appel pour ne pas masquer l'état en cours.
          if (!submitting) setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirm.title")}</DialogTitle>
            <DialogDescription>{t("confirm.description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <ConfirmColumn title={t("confirm.given")} emptyLabel={t("confirm.none")} cards={offer} tone="destructive" />
            <ConfirmColumn title={t("confirm.received")} emptyLabel={t("confirm.none")} cards={request} tone="positive" />
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              {t("confirm.cancel")}
            </Button>
            <Button className="gap-2" disabled={submitting} onClick={submitTrade}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {t("confirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  cards: TradeSelection[];
  tone: "destructive" | "positive";
}) {
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
    </div>
  );
}
