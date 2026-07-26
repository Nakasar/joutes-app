"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicUser } from "@/lib/db/users";
import type { Trade } from "@/lib/db/trades";

function userLabel(user: PublicUser): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

/**
 * Accueil des échanges : ouvrir un nouvel échange, en rejoindre un avec son
 * code, reprendre ceux en cours et consulter l'historique.
 */
export default function TradeHubClient({
  initialOpen,
  initialPast,
  currentUserId,
}: {
  initialOpen: Trade[];
  initialPast: Trade[];
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

      {/* Historique */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t("hub.historyTitle")}</h2>
        {initialPast.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("hub.noHistory")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {initialPast.map((trade) => (
              <li key={trade.id}>
                <TradeRow trade={trade} currentUserId={currentUserId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TradeRow({ trade, currentUserId }: { trade: Trade; currentUserId: string }) {
  const t = useTranslations("Trade");

  const mySide = trade.sides.find((side) => side.user?.id === currentUserId) ?? trade.sides[0];
  const otherSide = trade.sides.find((side) => side.id !== mySide.id) ?? trade.sides[1];
  const partner = otherSide.user;

  const givenCopies = mySide.cards.reduce((sum, card) => sum + card.quantity, 0);
  const receivedCopies = otherSide.cards.reduce((sum, card) => sum + card.quantity, 0);

  const date = DateTime.fromISO(
    trade.completedAt ?? trade.cancelledAt ?? trade.updatedAt
  ).toLocaleString(DateTime.DATETIME_MED);

  return (
    <Link
      href={`/trade/${trade.id}`}
      className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" />
          {partner ? userLabel(partner) : t("noPartner")}
        </p>
        <StatusBadge trade={trade} mineValidated={!!mySide.validatedAt} />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("summary", { offered: givenCopies, received: receivedCopies })}
      </p>
      <p className="mt-auto text-xs text-muted-foreground">{date}</p>
    </Link>
  );
}

function StatusBadge({ trade, mineValidated }: { trade: Trade; mineValidated: boolean }) {
  const t = useTranslations("Trade");

  if (trade.status === "completed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        {t("hub.badgeCompleted")}
      </span>
    );
  }

  if (trade.status === "cancelled") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        <Ban className="size-3.5" />
        {t("hub.badgeCancelled")}
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
      {mineValidated ? <BadgeCheck className="size-3.5" /> : null}
      {mineValidated ? t("hub.badgeValidated") : t("hub.badgeOpen")}
    </span>
  );
}
