'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ArrowDownSquareIcon } from "lucide-react";

type TabKey = "portal" | "members" | "collection" | "wishlists" | "sellList" | "settings";

export function PlayGroupToolsNavBar({
  playGroupId,
  currentTab,
  canManageSettings,
}: {
  playGroupId: string;
  currentTab?: TabKey;
  canManageSettings?: boolean;
}) {
  const t = useTranslations('PlayGroups.nav');

  const tabs: { key: TabKey; href: string; show: boolean }[] = [
    { key: 'portal', href: `/play-groups/${playGroupId}`, show: true },
    { key: 'members', href: `/play-groups/${playGroupId}/members`, show: true },
    { key: 'collection', href: `/play-groups/${playGroupId}/collection`, show: true },
    { key: 'wishlists', href: `/play-groups/${playGroupId}/wishlists`, show: true },
    { key: 'sellList', href: `/play-groups/${playGroupId}/sell-list`, show: true },
    { key: 'settings', href: `/play-groups/${playGroupId}/settings`, show: !!canManageSettings },
  ];

  return (
    <>
      <div className="flex-row flex-wrap gap-2 justify-end hidden lg:flex">
        {tabs.filter((tab) => tab.show && tab.key !== currentTab).map((tab) => (
          <Button key={tab.key} variant="secondary" asChild>
            <Link href={tab.href} className="hover:underline">
              {t(tab.key)}
            </Link>
          </Button>
        ))}
      </div>
      <div className="lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              {t(currentTab ?? 'tools')}
              <ArrowDownSquareIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {tabs.filter((tab) => tab.show).map((tab) => (
              <DropdownMenuItem asChild key={tab.key}>
                <Link href={tab.href}>{t(tab.key)}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
