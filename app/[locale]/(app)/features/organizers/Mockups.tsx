import { getTranslations } from "next-intl/server";
import {
  Bell,
  BotMessageSquare,
  CalendarDays,
  Check,
  Clock,
  MapPin,
  Medal,
  Megaphone,
  Printer,
  QrCode,
  Radio,
  Smartphone,
  Sparkles,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { DeviceFrame } from "../Mockups.tsx";

/**
 * Mêmes mockups illustratifs que la page /features, côté organisateur : des
 * div et des dégradés, pas des captures d'écran — cet environnement n'a pas de
 * base de données à photographier. Toute la copie vient du namespace i18n
 * `FeaturesOrganizers.mockup`, pour qu'ils se lisent dans chaque langue.
 */
async function mockupT() {
  return getTranslations("FeaturesOrganizers.mockup");
}

export async function HeroMockup() {
  const t = await mockupT();
  const channels = [
    { icon: BotMessageSquare, label: t("hero.channelDiscord") },
    { icon: Smartphone, label: t("hero.channelMobile") },
    { icon: CalendarDays, label: t("hero.channelWeb") },
  ];
  return (
    <DeviceFrame accent="from-primary to-purple-600">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="size-3.5 text-primary" />
          {t("hero.title")}
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">
          {t("hero.capacity", { count: 24 })}
        </span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>{t("hero.registered", { count: 18 })}</span>
        <span>18/24</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-primary to-purple-600" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {channels.map((channel) => (
          <div
            key={channel.label}
            className="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 px-2 py-2 text-[9px] font-medium text-muted-foreground"
          >
            <channel.icon className="size-3.5 text-primary" />
            {channel.label}
          </div>
        ))}
      </div>
    </DeviceFrame>
  );
}

export async function LairPageMockup() {
  const t = await mockupT();
  // Quatre onglets, comme la vitrine réelle et comme la copie de la section.
  const tabs = [
    t("lairPage.tabNews"),
    t("lairPage.tabAgenda"),
    t("lairPage.tabGames"),
    t("lairPage.tabAbout"),
  ];
  return (
    <DeviceFrame accent="from-cyan-500 to-blue-500">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="flex size-5 items-center justify-center rounded bg-gradient-to-br from-cyan-400 to-blue-600 text-[9px] font-bold text-white">
            RD
          </span>
          {t("lairPage.name")}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-300">
          <Radio className="size-2.5" />
          {t("lairPage.live")}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((tab, i) => (
          <span
            key={tab}
            className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${
              i === 0 ? "bg-cyan-500 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-[10px]">
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[8px] font-bold text-cyan-700 dark:text-cyan-300">
          {t("lairPage.pinned")}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{t("lairPage.newsTitle")}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md bg-blue-500/10 px-2.5 py-2 text-[10px] text-blue-700 dark:text-blue-300">
        <span className="font-medium">{t("lairPage.featured")}</span>
        <span>{t("lairPage.seats")}</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="size-3" />
        {t("lairPage.openUntil")}
      </div>
    </DeviceFrame>
  );
}

export async function CalendarMockup() {
  const t = await mockupT();
  // Les jours porteurs d'un événement sont figés : un mockup ne doit pas
  // dépendre de la date du rendu, sinon la page change d'illustration sans que
  // rien n'ait bougé.
  const eventDays = [5, 12, 13, 19, 26];
  return (
    <DeviceFrame accent="from-blue-500 to-cyan-500">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <CalendarDays className="size-3.5 text-blue-500" />
          {t("calendar.month")}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[9px] font-medium text-cyan-700 dark:text-cyan-300">
          <MapPin className="size-2.5" />
          {t("calendar.nearby")}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 28 }, (_, i) => {
          const day = i + 1;
          const hasEvent = eventDays.includes(day);
          return (
            <div
              key={day}
              className={`flex aspect-square flex-col items-center justify-center rounded-sm text-[8px] ${
                hasEvent
                  ? "bg-gradient-to-br from-blue-400 to-cyan-500 font-bold text-white"
                  : "bg-muted text-muted-foreground/60"
              }`}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-blue-500/10 px-2.5 py-1.5 text-[10px] text-blue-700 dark:text-blue-300">
        <Trophy className="size-3.5 shrink-0" />
        {t("calendar.eventShort")}
      </div>
    </DeviceFrame>
  );
}

export async function EngagementMockup() {
  const t = await mockupT();
  const rows = [
    { icon: BotMessageSquare, label: t("engagement.discord"), tone: "text-indigo-500" },
    { icon: Bell, label: t("engagement.push", { count: 42 }), tone: "text-amber-500" },
    { icon: Sparkles, label: t("engagement.ai"), tone: "text-fuchsia-500" },
  ];
  return (
    <DeviceFrame accent="from-violet-500 to-fuchsia-500">
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-[10px]"
          >
            <row.icon className={`size-3.5 shrink-0 ${row.tone}`} />
            <span className="flex-1">{row.label}</span>
            <Check className="size-3 shrink-0 text-emerald-500" />
          </div>
        ))}
      </div>
    </DeviceFrame>
  );
}

export async function PostersMockup() {
  const t = await mockupT();
  // Une affiche réduite : trois lignes d'événements, la signature et le QR
  // code du pied de page. Les dates sont écrites en dur — un mockup qui suivrait
  // le calendrier changerait d'illustration sans que rien n'ait bougé.
  const events = [
    { label: t("posters.event1"), hour: t("posters.hour1") },
    { label: t("posters.event2"), hour: t("posters.hour2") },
    { label: t("posters.event3"), hour: t("posters.hour3") },
  ];
  return (
    <DeviceFrame accent="from-rose-500 to-pink-500">
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-2.5 py-2 text-white">
          <div className="text-[11px] font-bold leading-tight">{t("posters.name")}</div>
          <div className="text-[9px] opacity-90">{t("posters.period")}</div>
        </div>
        <div className="space-y-1 px-2.5 py-2">
          {events.map((event) => (
            <div
              key={event.label}
              className="flex items-center justify-between gap-2 rounded-sm bg-muted/50 px-2 py-1 text-[10px]"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{event.label}</span>
              <span className="font-mono text-[9px] text-muted-foreground">{event.hour}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t px-2.5 py-2">
          <QrCode className="size-6 shrink-0 text-rose-500" />
          <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-muted-foreground">
            {t("posters.brand")}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-pink-500/10 px-2.5 py-1.5 text-[10px] text-pink-700 dark:text-pink-300">
        <Printer className="size-3.5 shrink-0" />
        {t("posters.format")}
      </div>
    </DeviceFrame>
  );
}

export async function RegistrationsMockup() {
  const t = await mockupT();
  const players = [
    { name: t("registrations.player1"), state: t("registrations.checkedIn"), tone: "emerald" },
    { name: t("registrations.player2"), state: t("registrations.registered"), tone: "sky" },
    { name: t("registrations.player3"), state: t("registrations.pending"), tone: "amber" },
  ] as const;
  const toneClass = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  };
  return (
    <DeviceFrame accent="from-emerald-500 to-teal-500">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
        <Users className="size-3.5 text-emerald-500" />
        {t("registrations.title")}
      </div>
      <div className="space-y-1.5">
        {players.map((player) => (
          <div
            key={player.name}
            className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[10px]"
          >
            <span className="font-medium">{player.name}</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${toneClass[player.tone]}`}>
              {player.state}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-teal-500/10 px-2.5 py-1.5 text-[10px] text-teal-700 dark:text-teal-300">
        <Check className="size-3.5 shrink-0" />
        {t("registrations.formField")}
      </div>
    </DeviceFrame>
  );
}

export async function TournamentsMockup() {
  const t = await mockupT();
  const pairings = [
    { table: 1, left: "Alex", right: "Sam" },
    { table: 2, left: "Lou", right: "Nour" },
  ];
  return (
    <DeviceFrame accent="from-orange-500 to-red-500">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Trophy className="size-3.5 text-orange-500" />
          {t("tournaments.round")}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-orange-700 dark:text-orange-300">
          <Timer className="size-3" />
          {t("tournaments.timer")}
        </span>
      </div>
      <div className="space-y-1.5">
        {pairings.map((pairing) => (
          <div
            key={pairing.table}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px]"
          >
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              {t("tournaments.table", { number: pairing.table })}
            </span>
            <span className="flex-1 text-center font-medium">
              {pairing.left}{" "}
              <span className="text-muted-foreground">{t("tournaments.versus")}</span>{" "}
              {pairing.right}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-700 dark:text-red-300">
        <Megaphone className="size-3.5 shrink-0" />
        {t("tournaments.announcement")}
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
    <DeviceFrame accent="from-indigo-500 to-violet-500">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
        <Medal className="size-3.5 text-indigo-500" />
        {t("leagues.name")}
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.pos}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px]"
          >
            <span
              className={`flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                row.pos === 1 ? "bg-amber-500" : row.pos === 2 ? "bg-slate-400" : "bg-orange-800/60"
              }`}
            >
              {row.pos}
            </span>
            <span className="flex-1 font-medium">{row.name}</span>
            <span className="text-muted-foreground">{t("leagues.points", { count: row.pts })}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-indigo-500/10 px-2.5 py-1.5 text-[10px] text-indigo-700 dark:text-indigo-300">
        <Clock className="size-3.5 shrink-0" />
        {t("leagues.deadline")}
      </div>
    </DeviceFrame>
  );
}

export async function IntegrationsMockup() {
  const t = await mockupT();
  return (
    <DeviceFrame accent="from-slate-500 to-slate-700">
      <div className="rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-[10px] font-semibold">
        {t("integrations.endpoint")}
      </div>
      <div className="mt-2 space-y-1 rounded-md border px-2.5 py-2 font-mono text-[9px] text-muted-foreground">
        <div className="text-foreground/70">&#123;</div>
        <div className="pl-3">{t("integrations.field1")},</div>
        <div className="pl-3">{t("integrations.field2")}</div>
        <div className="text-foreground/70">&#125;</div>
      </div>
    </DeviceFrame>
  );
}
