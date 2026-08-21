import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowLeftRight, Globe, Heart, Info, Tag } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { getWishlistsForOwner } from "@/lib/db/wishlists.ts";
import { getSellListForOwner, getSellListItems } from "@/lib/db/sell-lists.ts";

import { readGroupTradeMatches } from "../trade-data.ts";
import { memberName, readGroupMembers, requirePlayGroupMember } from "../group-data.ts";
export default async function ListsView({ playGroupId }: { playGroupId: string }) {
  const [, wishlists, t] = await Promise.all([
    requirePlayGroupMember(playGroupId),
    getWishlistsForOwner({ type: "playGroup", id: playGroupId }),
    getTranslations("PlayGroups.hub.lists"),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("summary", { count: wishlists.length })}</p>
      </header>

      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border bg-card/60" aria-hidden />}>
        <TradesBand playGroupId={playGroupId} />
      </Suspense>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Heart className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
            <h2 className="text-lg font-bold">{t("wishlistsTitle")}</h2>
            <Button variant="outline" size="sm" className="ml-auto" asChild>
              <Link href={`/play-groups/${playGroupId}/wishlists`}>{t("openWishlists")}</Link>
            </Button>
          </div>

          {wishlists.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("wishlistsEmpty")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {wishlists.map((wishlist) => (
                <Link
                  key={wishlist.id}
                  href={`/play-groups/${playGroupId}/wishlists`}
                  className="flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors hover:bg-accent"
                >
                  <span className="font-medium">{wishlist.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{wishlist.itemsCount}</span>
                  <span className="font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase">
                    {wishlist.isDefault
                      ? t("badgeDefault")
                      : t(wishlist.visibility === "public" ? "badgePublic" : "badgePrivate")}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <p className="flex gap-2.5 rounded-[10px] border border-[#E8B969]/40 bg-[#E8B969]/10 px-3.5 py-3 text-[13px] text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-[#E8B969]" aria-hidden />
            {t("advancedNotice")}
          </p>
        </section>

        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border bg-card/60" aria-hidden />}>
          <SellListCard playGroupId={playGroupId} />
        </Suspense>
      </div>
    </div>
  );
}

/** Les rapprochements souhaits ↔ ventes, en bandeau. */
async function TradesBand({ playGroupId }: { playGroupId: string }) {
  const [matches, members, t] = await Promise.all([
    readGroupTradeMatches(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.lists"),
  ]);

  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-[var(--group-accent-28)] bg-[image:var(--group-accent-sweep)] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ArrowLeftRight className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{t("tradesTitle", { count: matches.length })}</h2>
        <p className="ml-auto font-mono text-[11px] text-muted-foreground">{t("tradesHint")}</p>
      </div>

      {matches.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("tradesEmpty")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.slice(0, 6).map((match) => (
            <div
              key={`${match.cardId}-${match.seekerId}-${match.holderId}`}
              className="flex flex-col gap-1.5 rounded-[10px] border bg-background/60 p-3.5"
            >
              <p className="text-sm font-semibold">{match.name}</p>
              {match.gameName && <p className="text-[13px] text-muted-foreground">{match.gameName}</p>}
              <p className="font-mono text-[11px] text-emerald-300">
                {t("seeks", {
                  seeker: memberName(members, match.seekerId),
                  holder: memberName(members, match.holderId),
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** La liste de vente du groupe : une seule, publique, alimentée par chaque membre. */
async function SellListCard({ playGroupId }: { playGroupId: string }) {
  const [sellList, t] = await Promise.all([
    getSellListForOwner({ type: "playGroup", id: playGroupId }),
    getTranslations("PlayGroups.hub.lists"),
  ]);

  const items = sellList ? (await getSellListItems(sellList.id, { limit: 6 })).items : [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tag className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{t("sellListTitle")}</h2>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link href={`/play-groups/${playGroupId}/sell-list`}>{t("openSellList")}</Link>
        </Button>
      </div>

      <p className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
        <Globe className="size-4 shrink-0" aria-hidden />
        {t("sellListNotice")}
      </p>

      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("sellListEmpty")}</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border bg-background/40 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {[item.gameName, item.condition].filter(Boolean).join(" · ")}
              </p>
            </div>
            {typeof item.price === "number" && (
              <p className="font-mono text-sm">
                {item.price} {item.currency ?? "EUR"}
              </p>
            )}
          </div>
        ))
      )}
    </section>
  );
}
