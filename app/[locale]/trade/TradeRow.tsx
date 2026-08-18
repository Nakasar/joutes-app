"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { BadgeCheck, Ban, CheckCircle2, Users } from "lucide-react";
import { UserBadges } from "@/components/UserBadges";
import type { PublicUser } from "@/lib/db/users";
import type { Trade } from "@/lib/db/trades";

export function userLabel(user: PublicUser): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

/**
 * Une ligne d'échange, la même en cours et dans l'historique.
 *
 * Extraite de `TradeHubClient` quand l'historique est devenu filtrable : les
 * deux listes ne sont plus rendues par le même composant, et deux copies de
 * cette carte auraient divergé à la première retouche.
 */
export function TradeRow({ trade, currentUserId }: { trade: Trade; currentUserId: string }) {
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" />
          {partner ? userLabel(partner) : t("noPartner")}
          <UserBadges badges={partner?.badges} />
        </p>
        <TradeStatusBadge trade={trade} mineValidated={!!mySide.validatedAt} />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("summary", { offered: givenCopies, received: receivedCopies })}
      </p>
      <p className="mt-auto text-xs text-muted-foreground">{date}</p>
    </Link>
  );
}

function TradeStatusBadge({ trade, mineValidated }: { trade: Trade; mineValidated: boolean }) {
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
