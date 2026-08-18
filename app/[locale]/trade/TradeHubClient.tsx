"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftRight, ArrowRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicUser } from "@/lib/db/users";
import type { Trade } from "@/lib/db/trades";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import TradeHistory from "./TradeHistory";
import { TradeRow } from "./TradeRow";

/**
 * Accueil des échanges : ouvrir un nouvel échange, en rejoindre un avec son
 * code, reprendre ceux en cours et consulter l'historique.
 */
export default function TradeHubClient({
  initialOpen,
  initialPast,
  initialTotal,
  hiddenCount,
  partners,
  canFilter,
  unlockedByPlan,
  currentUserId,
}: {
  initialOpen: Trade[];
  initialPast: Trade[];
  /** Total des échanges clos visibles : `initialPast` n'en est que la première page. */
  initialTotal: number;
  /** Échanges clos plus anciens que la fenêtre visible sans abonnement. */
  hiddenCount: number;
  partners: PublicUser[];
  /** Reflet de `trades:full_history` : la règle, elle, est appliquée au serveur. */
  canFilter: boolean;
  /** Le palier à créditer des filtres, ou `null` si aucun abonnement ne les ouvre. */
  unlockedByPlan: SubscriptionPlanKey | null;
  currentUserId: string;
}) {
  const t = useTranslations("Trade");
  const router = useRouter();

  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const createTrade = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/trades", { method: "POST" });
      const data: { trade?: Trade } = await res.json().catch(() => ({}));
      if (!res.ok || !data.trade) {
        toast.error(t("errors.failed"));
        return;
      }
      router.push(`/trade/${data.trade.id}`);
    } catch (error) {
      console.error("Failed to create a trade:", error);
      toast.error(t("errors.failed"));
    } finally {
      setCreating(false);
    }
  };

  const joinTrade = async () => {
    const value = code.trim().toUpperCase();
    if (!value) return;

    setJoining(true);
    try {
      const res = await fetch("/api/trades/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data: { trade?: Trade; error?: string } = await res.json().catch(() => ({}));

      if (!res.ok || !data.trade) {
        toast.error(
          data.error === "not-found"
            ? t("join.errors.notFound")
            : data.error === "side-taken"
              ? t("join.errors.taken")
              : data.error === "closed"
                ? t("join.errors.closed")
                : t("errors.failed")
        );
        return;
      }

      router.push(`/trade/${data.trade.id}`);
    } catch (error) {
      console.error("Failed to join a trade:", error);
      toast.error(t("errors.failed"));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ArrowLeftRight className="size-7 text-primary" />
            {t("hub.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("hub.subtitle")}</p>
        </div>
        <Button className="gap-2" disabled={creating} onClick={() => void createTrade()}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("hub.create")}
        </Button>
      </div>

      {/* Rejoindre avec un code */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("join.title")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("join.description")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={t("join.placeholder")}
            className="font-mono tracking-[0.2em] sm:max-w-[220px]"
            onKeyDown={(event) => {
              if (event.key === "Enter") void joinTrade();
            }}
          />
          <Button variant="outline" className="gap-2" disabled={joining || !code.trim()} onClick={() => void joinTrade()}>
            {joining ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {t("join.submit")}
          </Button>
        </div>
      </section>

      {/* Échanges en cours */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t("hub.openTitle")}</h2>
        {initialOpen.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("hub.noOpen")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {initialOpen.map((trade) => (
              <li key={trade.id}>
                <TradeRow trade={trade} currentUserId={currentUserId} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <TradeHistory
        initialItems={initialPast}
        initialTotal={initialTotal}
        hiddenCount={hiddenCount}
        partners={partners}
        canFilter={canFilter}
        unlockedByPlan={unlockedByPlan}
        currentUserId={currentUserId}
      />
    </div>
  );
}
