"use client";

import { useState } from "react";
import {
  Boxes,
  Dices,
  Download,
  Flag,
  House,
  Inbox,
  type LucideIcon,
  MapPin,
  Menu,
  MessageCircle,
  SlidersHorizontal,
  SquareStack,
  Swords,
  Trophy,
  Users,
  X,
} from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation.ts";
import {
  ADMIN_NAVIGATION,
  type AdminNavBadgeKey,
  type AdminNavIcon,
  findActiveAdminNavHref,
} from "@/lib/admin/navigation.ts";
import { cn } from "@/lib/utils.ts";

const ICONS: Record<AdminNavIcon, LucideIcon> = {
  home: House,
  flag: Flag,
  inbox: Inbox,
  dice: Dices,
  card: SquareStack,
  box: Boxes,
  trophy: Trophy,
  users: Users,
  pin: MapPin,
  swords: Swords,
  download: Download,
  chat: MessageCircle,
  sliders: SlidersHorizontal,
};

export type AdminBadges = Partial<Record<AdminNavBadgeKey, number>>;

/**
 * Le menu de l'administration : une colonne sur un grand écran, un tiroir sur
 * un téléphone. Les deux lisent la même liste et allument la même entrée.
 */
export function AdminSidebar({ badges }: { badges: AdminBadges }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu de l'administration"
          aria-expanded={open}
          className="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <span className="text-sm font-semibold">Administration</span>
      </div>

      <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:block">
        <div className="sticky top-0 max-h-dvh overflow-y-auto px-3 py-5">
          <AdminNavList pathname={pathname} badges={badges} />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de l'administration"
            className="flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-card px-3 py-4 shadow-xl"
          >
            <div className="flex items-center justify-between pl-2">
              <span className="text-sm font-semibold">Administration</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {/* Choisir une page referme le tiroir : sans ça, il restait ouvert
                par-dessus la page qu'on venait d'ouvrir. */}
            <AdminNavList pathname={pathname} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/45"
          />
        </div>
      )}
    </>
  );
}

function AdminNavList({
  pathname,
  badges,
  onNavigate,
}: {
  pathname: string;
  badges: AdminBadges;
  onNavigate?: () => void;
}) {
  const activeHref = findActiveAdminNavHref(pathname);

  return (
    // Deuxième repère « navigation » de la page, après celui de l'en-tête du
    // site : sans nom, un lecteur d'écran les annonce tous deux « navigation ».
    <nav aria-label="Administration" className="flex flex-col gap-5">
      {ADMIN_NAVIGATION.map((group) => (
        <div key={group.title || "accueil"} className="flex flex-col gap-0.5">
          {group.title && (
            <span className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </span>
          )}
          {group.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.href === activeHref;
            const count = item.badge ? badges[item.badge] ?? 0 : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                  active
                    ? "bg-sky-100 font-semibold text-sky-900 dark:bg-sky-500/15 dark:text-sky-100"
                    : "text-foreground/85 hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                    <span className="sr-only">, </span>
                    {count}
                    <span className="sr-only"> en attente</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
