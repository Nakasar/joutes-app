"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftRight, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { PublicUser } from "@/lib/db/users.ts";
import type { Trade, TradeStatus } from "@/lib/db/trades.ts";

function userLabel(user: PublicUser): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

export default function JoinTradeClient({
  code,
  host,
  status,
  isFull,
}: {
  code: string;
  host: PublicUser | null;
  status: TradeStatus;
  isFull: boolean;
}) {
  const t = useTranslations("Trade");
  const router = useRouter();
  const [joining, setJoining] = useState(false);

  const blocked = status !== "open" || isFull;

  const join = async () => {
    setJoining(true);
    try {
      const res = await fetch("/api/trades/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: { trade?: Trade; error?: string } = await res.json().catch(() => ({}));

      if (!res.ok || !data.trade) {
        toast.error(
          data.error === "side-taken"
            ? t("join.errors.taken")
            : data.error === "closed"
              ? t("join.errors.closed")
              : data.error === "not-found"
                ? t("join.errors.notFound")
                : t("errors.failed")
        );
        return;
      }

      router.push(`/trade/${data.trade.id}`);
    } catch (error) {
      console.error("Failed to join the trade:", error);
      toast.error(t("errors.failed"));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
      <ArrowLeftRight className="size-10 text-primary" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("join.pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {host ? t("join.invitedBy", { name: userLabel(host) }) : t("join.description")}
        </p>
      </div>

      <code className="rounded-md bg-muted px-3 py-1.5 text-lg font-bold tracking-[0.2em]">{code}</code>

      {blocked ? (
        <p className="text-sm text-muted-foreground">
          {status !== "open" ? t("join.errors.closed") : t("join.errors.taken")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button className="gap-2" disabled={joining || blocked} onClick={() => void join()}>
          {joining ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {t("join.accept")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/trade">{t("backToList")}</Link>
        </Button>
      </div>
    </div>
  );
}
