"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation.ts";
import { ProfileAvatar } from "@/components/users/ProfileAvatar.tsx";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans.ts";
import type { UserProfileTab } from "@/lib/users/profile-tabs.ts";
import type { UserLink } from "@/lib/users/links.ts";
import { cn } from "@/lib/utils.ts";

import { ProfileLinkIcon } from "./ProfileLinkIcon.tsx";

/**
 * La barre d'onglets de la vitrine.
 *
 * Elle se colle en haut au défilement et **révèle alors l'avatar et le
 * pseudonyme** : la bannière ayant disparu, sans eux on ne saurait plus sur
 * quel profil on se trouve. Tant que la bannière est visible, ces deux-là
 * seraient un doublon — d'où la sentinelle plutôt qu'un affichage permanent.
 * Même mécanique que la vitrine d'un lieu.
 *
 * L'identité reste dans le flux, en `aria-hidden` quand elle est masquée : elle
 * n'apporte rien à la synthèse vocale, qui vient de lire le titre.
 *
 * La rangée défile horizontalement sur un téléphone, avec `overflow-y: hidden`
 * — sans quoi le navigateur réserve une gouttière verticale inutile — et sans
 * barre visible.
 */
export default function ProfileTabsBar({
  profilePath,
  displayName,
  avatar,
  plan,
  tabs,
  activeTab,
  links,
}: {
  profilePath: string;
  displayName: string;
  avatar?: string;
  plan: SubscriptionPlanKey | null;
  tabs: UserProfileTab[];
  activeTab: UserProfileTab;
  links: UserLink[];
}) {
  const t = useTranslations("Users.profile.tabs");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      threshold: 0,
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden />
      <div className="sticky top-0 z-40 border-b bg-card/95 shadow-[0_6px_18px_rgba(0,0,0,.35)] backdrop-blur">
        <div className="container mx-auto flex max-w-7xl items-center gap-4 px-4 lg:px-10">
          <div
            aria-hidden={!isStuck}
            className={cn(
              "flex shrink-0 items-center gap-2.5 overflow-hidden transition-all duration-150",
              isStuck ? "max-w-[240px] opacity-100" : "max-w-0 opacity-0",
            )}
          >
            <ProfileAvatar src={avatar} name={displayName} plan={plan} size={28} />
            <span className="truncate text-[15px] font-semibold">{displayName}</span>
            <span className="h-[22px] w-px shrink-0 bg-border" />
          </div>

          <nav
            aria-label={t("label")}
            className="-mb-px flex min-w-0 flex-1 items-center gap-5 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab) => {
              const isActive = tab === activeTab;

              return (
                <Link
                  key={tab}
                  href={tab === "showcase" ? profilePath : `${profilePath}?tab=${tab}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "shrink-0 border-b-2 py-3.5 text-sm whitespace-nowrap transition-colors",
                    // 44 px de cible tactile sur un téléphone : les 35 px que
                    // donnait le seul `py-3.5` passaient sous le minimum.
                    "flex min-h-11 items-center sm:min-h-0",
                    isActive
                      ? "border-primary font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(tab)}
                </Link>
              );
            })}
          </nav>

          {links.length > 0 && (
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
              {links.slice(0, 5).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={link.label ?? link.host}
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ProfileLinkIcon kind={link.kind} className="size-4" />
                  <span className="sr-only">{link.label ?? link.host}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
