import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Heart,
  MapPin,
  Medal,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

/**
 * These are stylized, hand-built mockups (plain divs/gradients), not real
 * screenshots — the app has no live database in this environment, so the
 * closest faithful alternative is illustrative UI representations rather
 * than a photo of a running screen. All copy comes from the Features.mockup
 * i18n namespace so they read naturally in every locale.
 */
function DeviceFrame({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div className="group relative">
      <div
        className={`absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br ${accent} opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-40`}
      />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/10">
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-yellow-400/70" />
          <span className="size-2.5 rounded-full bg-green-400/70" />
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function Swatch({ className = "" }: { className?: string }) {
  return <div className={`aspect-[3/4] rounded-md bg-gradient-to-br ${className}`} />;
}

async function mockupT() {
  return getTranslations("Features.mockup");
}

export async function GamesMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-blue-500 to-cyan-500">
      <div className="mb-3 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Search className="size-3.5" />
        {t("games.searchPlaceholder")}
      </div>
      <div className="mb-3 flex gap-2">
        {["Riftbound", "Lorcana", "Altered"].map((game, i) => (
          <span
            key={game}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              i === 0 ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {game}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Swatch className="from-blue-400/70 to-blue-600/70" />
        <Swatch className="from-cyan-400/70 to-blue-500/70" />
        <Swatch className="from-indigo-400/70 to-blue-500/70" />
        <Swatch className="from-sky-400/70 to-cyan-600/70" />
      </div>
    </DeviceFrame>
  );
}

export async function CardsMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-violet-500 to-fuchsia-500">
      <div className="flex gap-3">
        <div className="aspect-[3/4] w-20 shrink-0 rounded-lg bg-gradient-to-br from-violet-400/70 to-fuchsia-600/70" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-3/4 rounded bg-foreground/80" />
          <div className="flex gap-1.5">
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-medium text-violet-600 dark:text-violet-300">
              {t("cards.domain")}
            </span>
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-medium text-fuchsia-600 dark:text-fuchsia-300">
              {t("cards.cost", { value: 3 })}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
              {t("cards.might", { value: 5 })}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t pt-3">
        <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
          <BadgeCheck className="size-3.5 shrink-0" />
          {t("cards.ruling", { count: 12 })}
        </div>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground/60 line-through decoration-muted-foreground/40">
          <span className="size-3.5 shrink-0 rounded-full border border-current" />
          {t("cards.outdatedErrata")}
        </div>
      </div>
    </DeviceFrame>
  );
}

export async function CollectionMockup() {
  const t = await mockupT();
  const bars = [
    { label: t("collection.masterSet"), value: 72, tone: "from-emerald-400 to-emerald-600" },
    { label: t("collection.gameSet"), value: 91, tone: "from-teal-400 to-emerald-500" },
  ];
  return (
    <DeviceFrame accent="from-emerald-500 to-teal-500">
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
              <span>{bar.label}</span>
              <span>{bar.value}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${bar.tone}`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {[1, 1, 1, 0, 1].map((owned, i) => (
          <div
            key={i}
            className={`relative aspect-[3/4] rounded-md ${
              owned ? "bg-gradient-to-br from-emerald-400/70 to-teal-600/70" : "bg-muted grayscale"
            }`}
          >
            {owned === 1 && (
              <span className="absolute right-0.5 top-0.5 rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white">
                ×2
              </span>
            )}
          </div>
        ))}
      </div>
    </DeviceFrame>
  );
}

export async function PlayGroupsMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-amber-500 to-orange-500">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex -space-x-2">
          {["A", "B", "C"].map((letter, i) => (
            <span
              key={letter}
              className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-gradient-to-br from-amber-400 to-orange-500 text-[10px] font-bold text-white"
              style={{ zIndex: 3 - i }}
            >
              {letter}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="size-3" />
          {t("playGroups.sharedCollection")}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[10px]">
          <span className="font-medium">{t("playGroups.cardName1")}</span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
            {t("playGroups.borrowedBy", { name: "Alex" })}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[10px]">
          <span className="font-medium">{t("playGroups.cardName2")}</span>
          <span className="text-muted-foreground">{t("playGroups.available", { count: 3 })}</span>
        </div>
      </div>
    </DeviceFrame>
  );
}

export async function WishlistsMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-rose-500 to-pink-500">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Heart className="size-3.5 fill-rose-500 text-rose-500" />
          {t("wishlists.title")}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
          {t("wishlists.visibilityPublic")}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[10px]">
          <span>{t("wishlists.cardName1")}</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" />
            {t("wishlists.owned")}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[10px]">
          <span>{t("wishlists.cardName2")}</span>
          <span className="text-muted-foreground">{t("wishlists.wanted", { count: 1 })}</span>
        </div>
      </div>
    </DeviceFrame>
  );
}

export async function LairsMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-cyan-500 to-sky-500">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
        <MapPin className="size-3.5 text-cyan-500" />
        {t("lairs.name")}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 21 }, (_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-sm ${
              [4, 11, 16].includes(i) ? "bg-gradient-to-br from-cyan-400 to-sky-500" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-cyan-500/10 px-2.5 py-1.5 text-[10px] text-cyan-700 dark:text-cyan-300">
        <ChevronRight className="size-3.5" />
        {t("lairs.event")}
      </div>
    </DeviceFrame>
  );
}

export async function DecksMockup() {
  const t = await mockupT();
  const curve = [2, 4, 7, 9, 6, 3, 1];
  return (
    <DeviceFrame accent="from-indigo-500 to-blue-500">
      <div className="mb-3 flex items-center justify-between text-[10px]">
        <span className="font-semibold">{t("decks.name")}</span>
        <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
          <BadgeCheck className="size-3.5" />
          {t("decks.legal")}
        </span>
      </div>
      <div className="flex h-16 items-end gap-1.5">
        {curve.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-indigo-500 to-blue-400"
            style={{ height: `${(v / 9) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[8px] text-muted-foreground">
        <span>1</span>
        <span>{t("decks.costAxis")}</span>
        <span>7+</span>
      </div>
    </DeviceFrame>
  );
}

export async function LeaguesMockup() {
  const t = await mockupT();
  const rows = [
    { pos: 1, name: "Alex", pts: 42 },
    { pos: 2, name: "Sam", pts: 37 },
    { pos: 3, name: "Lou", pts: 33 },
  ];
  return (
    <DeviceFrame accent="from-orange-500 to-red-500">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
        <Trophy className="size-3.5 text-orange-500" />
        {t("leagues.name")}
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.pos} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px]">
            <span
              className={`flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                row.pos === 1 ? "bg-amber-500" : row.pos === 2 ? "bg-slate-400" : "bg-orange-800/60"
              }`}
            >
              {row.pos}
            </span>
            <span className="flex-1 font-medium">{row.name}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Medal className="size-3" />
              {t("leagues.points", { count: row.pts })}
            </span>
          </div>
        ))}
      </div>
    </DeviceFrame>
  );
}

export async function HeroMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-primary to-purple-600">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
        <Sparkles className="size-3.5 text-primary" />
        {t("hero.dashboard")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Swatch className="from-blue-400/70 to-cyan-500/70" />
        <Swatch className="from-violet-400/70 to-fuchsia-500/70" />
        <Swatch className="from-emerald-400/70 to-teal-500/70" />
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-primary to-purple-600" />
      </div>
    </DeviceFrame>
  );
}
