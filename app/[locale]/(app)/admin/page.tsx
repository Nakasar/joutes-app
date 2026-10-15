import type { ReactNode } from "react";
import { DateTime } from "luxon";
import {
  ArrowRight,
  Dices,
  Download,
  Flag,
  Inbox,
  MapPin,
  MessageCircle,
  RefreshCw,
  SlidersHorizontal,
  SquareStack,
  Trophy,
} from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getPendingReportGroups } from "@/lib/db/reports.ts";
import { countLairsNeedingAttention, getLairsNeedingAttention } from "@/lib/db/lairs.ts";
import { listContributions } from "@/lib/db/contributions.ts";
import { getAdminUserSummaries } from "@/lib/db/users.ts";
import { getAdminActivity } from "@/lib/db/admin-activity.ts";
import {
  ACTIVITY_PERIODS,
  type ActivityPeriod,
  type ActivitySeries,
  describeActivityDelta,
} from "@/lib/admin/activity.ts";
import { CONTRIBUTION_KINDS, CONTRIBUTION_KIND_LABELS } from "@/lib/contributions/feed.ts";
import { REPORTABLE_CONTENT_LABELS } from "@/lib/types/Report.ts";
import { adminUserTag } from "@/lib/users/admin-search.ts";
import { cn } from "@/lib/utils.ts";
import { AdminPanel } from "./_components/AdminPage.tsx";
import { contributionTone } from "./_components/tones.ts";

/**
 * L'accueil de l'administration : d'abord ce qui attend une décision, puis
 * l'activité de la plateforme, puis les raccourcis.
 *
 * La période des chiffres tient dans l'URL (`?periode=30j`), comme les filtres
 * des autres écrans : elle se partage et se recharge.
 */
export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const session = await requireAdmin();
  const { periode } = await searchParams;
  const period: ActivityPeriod = periode === "30j" ? "month" : "week";

  const now = new Date();
  const [reportGroups, lairsCount, lairsToFix, contributions, activity] = await Promise.all([
    getPendingReportGroups(),
    countLairsNeedingAttention(),
    getLairsNeedingAttention(3),
    listContributions({ kinds: [...CONTRIBUTION_KINDS], after: null, limit: 50 }),
    getAdminActivity(period, now),
  ]);

  const recent = contributions.items.slice(0, 6);
  const authors = await getAdminUserSummaries(
    recent.map((item) => item.authorId).filter((id): id is string => !!id)
  );
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const lastDay = contributions.items.filter((item) => item.publishedAt.getTime() >= dayAgo).length;
  const lastDayLabel = lastDay >= contributions.items.length && lastDay > 0 ? `${lastDay}+` : String(lastDay);

  const oldestReport = reportGroups.reduce<Date | null>(
    (oldest, group) => (!oldest || group.firstReportedAt < oldest ? group.firstReportedAt : oldest),
    null
  );
  const reportTypes = [...new Set(reportGroups.map((group) => REPORTABLE_CONTENT_LABELS[group.contentType]))];
  const pendingCount = (reportGroups.length > 0 ? 1 : 0) + (lairsCount > 0 ? 1 : 0);

  const today = DateTime.fromJSDate(now).setZone("Europe/Paris").setLocale("fr");
  const firstName = session.user.name?.split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-8 pb-16 sm:px-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {firstName ? `Bonjour ${firstName}` : "Bonjour"}
        </h1>
        <p className="text-[15px] text-muted-foreground first-letter:uppercase">
          {today.toFormat("cccc d LLLL")}.{" "}
          {pendingCount === 0
            ? "Rien n'attend de décision, tout tourne tout seul."
            : pendingCount === 1
              ? "Une chose attend une décision."
              : "Deux choses attendent une décision."}
        </p>
      </header>

      <section aria-labelledby="todo-title" className="flex flex-col gap-3.5">
        <h2 id="todo-title" className="text-lg font-semibold">
          À traiter
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TodoCard
            href="/admin/reports"
            tone={reportGroups.length > 0 ? "warning" : "calm"}
            icon={<Flag className="size-5" aria-hidden />}
            chip={oldestReport ? `Le plus ancien : ${relativeAge(oldestReport, now)}` : undefined}
            count={reportGroups.length}
            unit={reportGroups.length > 1 ? "contenus signalés" : "contenu signalé"}
            detail={reportGroups.length > 0 ? reportTypes.join(", ") : "Aucun signalement en attente."}
            cta={reportGroups.length > 0 ? "Trier les signalements" : "Voir les signalements"}
          />
          <TodoCard
            href="/admin/lairs?etat=a-surveiller"
            tone={lairsCount > 0 ? "danger" : "calm"}
            icon={<RefreshCw className="size-5" aria-hidden />}
            count={lairsCount}
            unit={lairsCount > 1 ? "agendas à surveiller" : "agenda à surveiller"}
            detail={
              lairsCount > 0
                ? `${lairsToFix.map((lair) => lair.name).join(", ")}${lairsCount > lairsToFix.length ? "…" : ""}`
                : "Tous les imports d'agenda ont réussi."
            }
            cta={lairsCount > 0 ? "Voir les lieux concernés" : "Voir les lieux"}
          />
          <TodoCard
            href="/admin/contributions"
            tone="info"
            icon={<Inbox className="size-5" aria-hidden />}
            chip="Dernières 24 h"
            count={lastDayLabel}
            unit={lastDay > 1 ? "nouvelles contributions" : "nouvelle contribution"}
            detail="Tout ce que les joueurs ont publié, du plus récent au plus ancien."
            cta="Ouvrir le centre des contributions"
          />
        </div>
      </section>

      <section aria-labelledby="activity-title" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="activity-title" className="text-lg font-semibold">
            {period === "week" ? "La semaine sur Joutes" : "Le mois sur Joutes"}
          </h2>
          <nav aria-label="Période" className="flex gap-1 rounded-lg bg-muted p-1">
            {(Object.keys(ACTIVITY_PERIODS) as ActivityPeriod[]).map((key) => (
              <Link
                key={key}
                href={key === "week" ? "/admin" : "/admin?periode=30j"}
                aria-current={key === period ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  key === period ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {ACTIVITY_PERIODS[key]} jours
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ActivityTile label="Nouveaux joueurs" series={activity.newUsers} period={period} />
          <ActivityTile label="Évènements ajoutés" series={activity.events} period={period} />
          <ActivityTile label="Tournois créés" series={activity.tournaments} period={period} />
          <ActivityTile label="Decks partagés" series={activity.decks} period={period} />
        </div>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <AdminPanel className="min-w-0 flex-[2] overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Dernières contributions</h2>
            <Link href="/admin/contributions" className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
              Tout voir
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Aucune contribution pour le moment.</p>
          ) : (
            <ul>
              {recent.map((item) => {
                const author = item.authorId ? authors.get(item.authorId) : undefined;
                const tag = author ? adminUserTag(author) : undefined;
                return (
                  <li key={`${item.kind}:${item.id}`} className="flex items-center gap-3.5 border-b border-border/60 px-5 py-3 last:border-b-0">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                      aria-hidden
                    >
                      {(tag ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {item.url ? (
                        <Link href={item.url} className="truncate text-sm font-semibold hover:underline">
                          {item.title}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-semibold">{item.title}</span>
                      )}
                      <span className="text-[13px] text-muted-foreground">
                        {tag ? `${tag} · ` : ""}
                        {relativeAge(item.publishedAt, now)}
                      </span>
                    </span>
                    <span className={cn("hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline", contributionTone(item.kind))}>
                      {CONTRIBUTION_KIND_LABELS[item.kind]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminPanel>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <AdminPanel className="flex flex-col gap-2 p-5">
            <h2 className="mb-1 font-semibold">Ajouter rapidement</h2>
            <QuickLink href="/admin/games" icon={<Dices aria-hidden />}>Un jeu</QuickLink>
            <QuickLink href="/admin/lairs" icon={<MapPin aria-hidden />}>Un lieu de jeu</QuickLink>
            <QuickLink href="/admin/cards" icon={<SquareStack aria-hidden />}>Une carte ou une variante</QuickLink>
            <QuickLink href="/admin/achievements/new" icon={<Trophy aria-hidden />}>Un succès</QuickLink>
          </AdminPanel>
          <AdminPanel className="flex flex-col gap-2 p-5">
            <h2 className="mb-1 font-semibold">Outils</h2>
            <QuickLink href="/admin/exports" icon={<Download aria-hidden />}>Exports de données</QuickLink>
            <QuickLink href="/admin/discord" icon={<MessageCircle aria-hidden />}>Commandes Discord</QuickLink>
            <QuickLink href="/admin/settings" icon={<SlidersHorizontal aria-hidden />}>Réglages</QuickLink>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}

const TODO_TONES = {
  warning: {
    card: "border-amber-300/70 dark:border-amber-500/40",
    icon: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  },
  danger: {
    card: "border-red-300/70 dark:border-red-500/40",
    icon: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-100",
  },
  info: {
    card: "border-border",
    icon: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100",
  },
  calm: {
    card: "border-border",
    icon: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
  },
} as const;

function TodoCard({
  href,
  tone,
  icon,
  chip,
  count,
  unit,
  detail,
  cta,
}: {
  href: string;
  tone: keyof typeof TODO_TONES;
  icon: ReactNode;
  chip?: string;
  count: number | string;
  unit: string;
  detail: string;
  cta: string;
}) {
  const styles = TODO_TONES[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md",
        styles.card
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", styles.icon)}>{icon}</span>
        {chip && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", styles.icon)}>{chip}</span>}
      </span>
      <span className="text-3xl leading-none font-bold">
        {count} <span className="text-base font-medium text-muted-foreground">{unit}</span>
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{detail}</span>
      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-sky-700 dark:text-sky-300">
        {cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

function ActivityTile({ label, series, period }: { label: string; series: ActivitySeries; period: ActivityPeriod }) {
  const max = Math.max(1, ...series.buckets);
  const delta = series.total - series.previous;
  return (
    <AdminPanel className="flex flex-col gap-2 px-5 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-bold tabular-nums">{series.total.toLocaleString("fr-FR")}</span>
      <span className="flex h-7 items-end gap-[3px]" aria-hidden>
        {series.buckets.map((value, index) => (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-[3px]",
              index === series.buckets.length - 1 ? "bg-sky-600 dark:bg-sky-400" : "bg-sky-200 dark:bg-sky-900"
            )}
            style={{ height: `${Math.max(4, Math.round((value / max) * 28))}px` }}
          />
        ))}
      </span>
      <span
        className={cn(
          "text-[13px] font-medium",
          delta > 0 && "text-emerald-700 dark:text-emerald-400",
          delta < 0 && "text-muted-foreground",
          delta === 0 && "text-muted-foreground"
        )}
      >
        {describeActivityDelta(series, period)}
      </span>
    </AdminPanel>
  );
}

function QuickLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg bg-muted/60 px-3 text-sm font-medium hover:bg-muted [&_svg]:size-[18px] [&_svg]:text-sky-700 dark:[&_svg]:text-sky-300"
    >
      {icon}
      {children}
    </Link>
  );
}

/** « il y a 12 min », « il y a 3 jours » : assez précis pour trier d'un coup d'œil. */
function relativeAge(date: Date, now: Date): string {
  return (
    DateTime.fromJSDate(date).setLocale("fr").toRelative({ base: DateTime.fromJSDate(now) }) ?? ""
  );
}
