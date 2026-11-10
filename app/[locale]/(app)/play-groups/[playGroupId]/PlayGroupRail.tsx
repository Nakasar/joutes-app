"use client";

import { useTranslations } from "next-intl";
import {
  Calendar,
  ChevronDown,
  Globe,
  Heart,
  Layers,
  LayoutDashboard,
  Library,
  Megaphone,
  Settings,
  Users,
} from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";
import { viewHref, type PlayGroupView } from "./views.ts";

const ICONS = {
  hub: LayoutDashboard,
  sessions: Calendar,
  announcements: Megaphone,
  contents: Library,
  decks: Layers,
  lists: Heart,
  members: Users,
  showcase: Globe,
  settings: Settings,
} as const;

type RailEntry = {
  key: PlayGroupView;
  href: string;
  badge?: number;
  /**
   * La section du rail. `game` et `group` portent un intitulé (« Jeu »,
   * « Groupe ») ; `aside` vit sous un séparateur, parce que ses entrées sortent
   * du hub ; sans section, l'entrée est en tête.
   */
  section?: RailSection;
};

type RailSection = "game" | "group" | "aside";

function entriesFor(playGroupId: string, pendingCount: number, unreadComments: number, canManage: boolean): RailEntry[] {
  return [
    { key: "hub", href: viewHref(playGroupId, "hub") },
    { key: "sessions", href: viewHref(playGroupId, "sessions"), badge: pendingCount },
    { key: "announcements", href: viewHref(playGroupId, "announcements") },
    { key: "contents", href: viewHref(playGroupId, "contents") },
    { key: "decks", href: viewHref(playGroupId, "decks"), section: "game", badge: unreadComments },
    { key: "lists", href: viewHref(playGroupId, "lists"), section: "group" },
    { key: "members", href: viewHref(playGroupId, "members"), section: "group" },
    { key: "showcase", href: viewHref(playGroupId, "showcase"), section: "aside" },
    ...(canManage
      ? [{ key: "settings" as const, href: viewHref(playGroupId, "settings"), section: "aside" as const }]
      : []),
  ];
}

/**
 * Le rail permanent du hub.
 *
 * Permanent au-dessus de `lg`, replié en menu déroulant en dessous — comme le
 * faisait déjà `PlayGroupToolsNavBar`, dont il prend la suite : sur un
 * téléphone, une colonne de 236 px mangerait la moitié de la largeur du plan de
 * travail.
 */
export default function PlayGroupRail({
  playGroupId,
  groupName,
  logo,
  memberCount,
  pendingCount,
  unreadComments = 0,
  canManage,
  active,
  roleLabel,
}: {
  playGroupId: string;
  groupName: string;
  logo?: string;
  memberCount: number;
  pendingCount: number;
  /** Les commentaires d'autrui non lus dans le fil des decks du groupe. */
  unreadComments?: number;
  canManage: boolean;
  active: PlayGroupView;
  roleLabel: string;
}) {
  const t = useTranslations("PlayGroups.hub.rail");
  const entries = entriesFor(playGroupId, pendingCount, unreadComments, canManage);
  const activeEntry = entries.find((entry) => entry.key === active);

  return (
    <>
      <nav className="hidden w-[236px] shrink-0 flex-col gap-4 self-stretch border-r bg-card/40 px-3 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <GroupEmblem logo={logo} name={groupName} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{groupName}</p>
            <p className="text-[11px] text-muted-foreground">{t("memberCount", { count: memberCount })}</p>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {entries
            .filter((entry) => !entry.section)
            .map((entry) => (
              <RailLink key={entry.key} entry={entry} active={active} label={t(entry.key)} />
            ))}
        </div>

        {(["game", "group"] as const).map((section) => (
          <div key={section} className="flex flex-col gap-0.5">
            <p className="px-3 pt-1.5 pb-0.5 text-[10px] tracking-[.08em] text-muted-foreground uppercase">
              {t(section === "game" ? "sectionGame" : "sectionGroup")}
            </p>
            {entries
              .filter((entry) => entry.section === section)
              .map((entry) => (
                <RailLink key={entry.key} entry={entry} active={active} label={t(entry.key)} />
              ))}
          </div>
        ))}

        <div className="flex flex-col gap-0.5 border-t pt-4">
          {entries
            .filter((entry) => entry.section === "aside")
            .map((entry) => (
              <RailLink key={entry.key} entry={entry} active={active} label={t(entry.key)} />
            ))}
        </div>

        <p className="mt-auto rounded-[10px] border bg-background/60 px-3 py-2.5 text-[11px] text-muted-foreground">
          {roleLabel}
        </p>
      </nav>

      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:hidden">
        <GroupEmblem logo={logo} name={groupName} />
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{groupName}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              {activeEntry ? t(activeEntry.key) : t("hub")}
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {entries.map((entry) => (
              <DropdownMenuItem asChild key={entry.key}>
                <Link href={entry.href}>{t(entry.key)}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

function RailLink({ entry, active, label }: { entry: RailEntry; active: PlayGroupView; label: string }) {
  const Icon = ICONS[entry.key];
  const isActive = entry.key === active;

  return (
    <Link
      href={entry.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-[var(--group-accent-14)] font-semibold text-[var(--group-accent-text)]"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {entry.badge ? (
        <span className="rounded-full bg-[var(--group-accent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--group-accent-foreground)]">
          {entry.badge}
        </span>
      ) : null}
    </Link>
  );
}

function GroupEmblem({ logo, name }: { logo?: string; name: string }) {
  if (logo) {
    return (
      <span className="size-10 shrink-0 overflow-hidden rounded-[11px] border border-[var(--group-accent-34)]">
        {/* `next/image` refuserait l'hôte : le logo est une URL saisie par le
            groupe, et `next.config.ts` n'autorise que le stockage blob. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-[var(--group-accent-34)] bg-[var(--group-accent-16)] text-sm font-bold text-[var(--group-accent-text)]"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
