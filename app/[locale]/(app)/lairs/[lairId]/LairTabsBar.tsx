"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { LairTab } from "./lair-data.ts";

const TABS: { key: LairTab; label: "news" | "agenda" | "games" | "about" }[] = [
  { key: "news", label: "news" },
  { key: "agenda", label: "agenda" },
  { key: "games", label: "games" },
  { key: "about", label: "about" },
];

type LairTabsBarProps = {
  lairId: string;
  lairName: string;
  logo?: string;
  activeTab: LairTab;
  canManageLair: boolean;
};

/**
 * La barre d'onglets de la vitrine.
 *
 * Elle se colle en haut au défilement et **révèle alors le logo et le nom du
 * lieu** : la bannière ayant disparu, sans eux on ne saurait plus sur quelle
 * page on se trouve. Tant que la bannière est visible, ces deux-là seraient un
 * doublon — d'où la sentinelle plutôt qu'un affichage permanent.
 *
 * L'identité reste dans le flux, en `aria-hidden` quand elle est masquée :
 * elle n'apporte rien à la synthèse vocale, qui vient de lire le titre.
 */
export default function LairTabsBar({
  lairId,
  lairName,
  logo,
  activeTab,
  canManageLair,
}: LairTabsBarProps) {
  const t = useTranslations("Lairs.portal.tabs");
  const tActions = useTranslations("Lairs.detail");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden />
      <div className="sticky top-0 z-40 border-b border-[var(--lair-accent-22)] bg-card/95 shadow-[0_6px_18px_rgba(0,0,0,.35)] backdrop-blur">
        <div className="container mx-auto flex max-w-7xl items-center gap-4 px-4 lg:px-10">
          <div
            aria-hidden={!isStuck}
            className={cn(
              "flex shrink-0 items-center gap-2.5 overflow-hidden transition-all duration-150",
              isStuck ? "max-w-[240px] opacity-100" : "max-w-0 opacity-0",
            )}
          >
            {logo ? (
              <span className="relative size-[30px] shrink-0 overflow-hidden rounded-lg border border-[var(--lair-accent-45)]">
                <Image src={logo} alt="" fill className="object-cover" sizes="30px" />
              </span>
            ) : null}
            <span className="truncate text-[15px] font-semibold">{lairName}</span>
            <span className="h-[22px] w-px shrink-0 bg-border" />
          </div>

          <nav
            aria-label={t("label")}
            className="-mb-px flex min-w-0 flex-1 items-center gap-5 overflow-x-auto"
          >
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;

              return (
                <Link
                  key={tab.key}
                  href={`/lairs/${lairId}${tab.key === "news" ? "" : `?tab=${tab.key}`}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "shrink-0 border-b-2 py-3.5 text-sm whitespace-nowrap transition-colors",
                    isActive
                      ? "border-[var(--lair-accent)] font-semibold text-[var(--lair-accent-text)]"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(tab.label)}
                </Link>
              );
            })}
          </nav>

          {canManageLair && (
            <Button variant="outline" size="sm" asChild className="my-2 hidden sm:inline-flex">
              <Link href={`/lairs/${lairId}/manage`}>
                <Settings className="mr-2 h-4 w-4" />
                {tActions("manage")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
