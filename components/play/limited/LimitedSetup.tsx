"use client";

import { useEffect, useState } from "react";
import { Bot, Globe, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createLimitedEventAction,
  listLimitedEventsAction,
} from "@/app/[locale]/(app)/games/riftbound/play/limited/actions";
import { LimitedHostPanel } from "@/components/play/limited/LimitedHostPanel";
import { useDelayLabel, useLimitedError } from "@/components/play/limited/LimitedRoom";
import { PlanUpsell } from "@/components/play/PlanUpsell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useRouter } from "@/i18n/navigation";
import { loadEngine } from "@/lib/engine/browser";
import {
  limitedRules,
  writeLimitedSave,
  type BoosterSet,
  type LimitedKind,
  type LimitedRecord,
  type LimitedSettings,
} from "@/lib/engine/limited";
import { BOT_LEVELS, type BotLevel } from "@/lib/engine/types";
import type { LimitedEventSummary, LimitedTimers } from "@/lib/types/LimitedEvent";
import { cn } from "@/lib/utils";

const TABLE_SIZES = [2, 4, 6, 8];

type Where = "ai" | "online" | "host";

/** Les délais proposés à l'hôte, en secondes ; 0 : pas de limite. */
const PICK_DELAYS = [0, 30, 60, 90, 120];
const BUILD_DELAYS = [0, 600, 1200, 1800, 2700];

/** Ce que la page Jouer sait de la personne : connectée, abonnée, serveur de parties branché. */
export type LimitedLobby = { online: boolean; signedIn: boolean; canHost: boolean };

const ROOM = "/games/riftbound/play/limited/room";

/**
 * Les réglages d'un scellé ou d'un draft : les boosters, puis où il se joue.
 * Contre des IA, l'évènement est créé par le moteur dans le navigateur et gardé
 * dans `localStorage`. En ligne, Joutes ouvre une salle d'attente ; en mode
 * hôte, il est créé sur le serveur de l'organisateur.
 */
export function LimitedSetup({
  kind,
  name,
  replaces,
  lobby,
}: {
  kind: LimitedKind;
  name: string;
  replaces: boolean;
  lobby: LimitedLobby;
}) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const router = useRouter();
  const rules = limitedRules(kind);
  const [sets, setSets] = useState<BoosterSet[] | null>(null);
  const [failed, setFailed] = useState(false);
  // L'extension de chaque booster ; `null` : la première extension proposée.
  const [packs, setPacks] = useState<(string | null)[]>([]);
  const [mixed, setMixed] = useState(false);
  const [players, setPlayers] = useState<number | null>(null);
  const [level, setLevel] = useState<BotLevel>("normal");
  const [busy, setBusy] = useState(false);
  const [where, setWhere] = useState<Where>("ai");
  const [timers, setTimers] = useState<LimitedTimers>({ pick: 60, build: 1200 });
  const [code, setCode] = useState("");
  const [mine, setMine] = useState<LimitedEventSummary[]>([]);
  const errorText = useLimitedError();
  const delayLabel = useDelayLabel();

  const listed = lobby.online && lobby.signedIn;
  useEffect(() => {
    if (!listed) return;
    let cancelled = false;
    void listLimitedEventsAction().then((result) => {
      if (!cancelled && result.ok) setMine(result.events.filter((event) => event.kind === kind));
    });
    return () => {
      cancelled = true;
    };
  }, [listed, kind]);

  useEffect(() => {
    let cancelled = false;
    loadEngine()
      .then((engine) => {
        if (!cancelled) setSets(JSON.parse(engine.booster_sets()) as BoosterSet[]);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{t("setup.failed")}</p>;
  if (!sets) return <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{t("setup.loading")}</p>;

  const count = players ?? (kind === "draft" ? 8 : 2);
  const packOf = (index: number): string => packs[index] ?? packs[0] ?? sets[0]?.code ?? "";
  const chosen = Array.from({ length: rules.boosters }, (_, index) => (mixed ? packOf(index) : packOf(0)));

  const setPack = (index: number, code: string) =>
    setPacks((previous) => {
      const next = Array.from({ length: rules.boosters }, (_, i) => previous[i] ?? null);
      next[index] = code;
      return next;
    });

  const start = async () => {
    setBusy(true);
    try {
      const engine = await loadEngine();
      const settings: LimitedSettings = {
        kind,
        packs: chosen,
        players: [
          { name, bot: null },
          ...Array.from({ length: count - 1 }, (_, index) => ({
            name: tPlay("lobby.botName", { number: index + 1 }),
            bot: level,
          })),
        ],
      };
      // Le moteur ouvre les boosters ici : il refuse des réglages qu'il ne sait pas tenir.
      const event = new engine.LimitedEvent(JSON.stringify(settings), Math.floor(Math.random() * 2 ** 31) + 1);
      const record = JSON.parse(event.record()) as LimitedRecord;
      event.free();
      writeLimitedSave({ record });
      router.push("/games/riftbound/play/limited");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  const createOnline = async () => {
    setBusy(true);
    const result = await createLimitedEventAction({ kind, packs: chosen, players: count, timers });
    if (result.ok) {
      router.push(`${ROOM}?id=${result.id}`);
      return;
    }
    toast.error(errorText(result.error));
    setBusy(false);
  };

  const joinCode = code.trim().toLowerCase().split("id=").pop() ?? "";

  const places: { key: Where; icon: typeof Bot; title: string; hint: string }[] = [
    { key: "ai", icon: Bot, title: t("setup.whereAi"), hint: t("setup.whereAiHint") },
    { key: "online", icon: Globe, title: tPlay("lobby.online"), hint: t("setup.whereOnlineHint") },
    { key: "host", icon: Server, title: tPlay("lobby.host"), hint: t("setup.whereHostHint") },
  ];

  const delaySelect = (id: string, label: string, values: number[], value: number, onChange: (next: number) => void) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((seconds) => (
            <SelectItem key={seconds} value={String(seconds)}>
              {delayLabel(seconds)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const timersBlock = (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("setup.timers")}</span>
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        {kind === "draft" &&
          delaySelect("limited-pick", t("setup.pickDelay"), PICK_DELAYS, timers.pick, (pick) =>
            setTimers({ ...timers, pick }),
          )}
        {delaySelect("limited-build", t("setup.buildDelay"), BUILD_DELAYS, timers.build, (build) =>
          setTimers({ ...timers, build }),
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("setup.timersHint")}</p>
    </div>
  );

  const playersBlock = (hint: string) => (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("setup.players")}</span>
      <div className="inline-flex self-start overflow-hidden rounded-lg border" role="group" aria-label={t("setup.players")}>
        {TABLE_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={count === size}
            onClick={() => setPlayers(size)}
            className={cn(
              "min-h-9 min-w-11 px-3 text-sm transition",
              count === size ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {size}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const setSelect = (index: number, label: string) => (
    <Select value={packOf(index)} onValueChange={(code) => setPack(index, code)}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sets.map((set) => (
          <SelectItem key={set.code} value={set.code}>
            {set.name} ({set.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{t("setup.boostersTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(kind === "draft" ? "setup.boostersDraft" : "setup.boostersSealed", {
            boosters: rules.boosters,
            size: rules.packSize,
            min: rules.minMain,
          })}
        </p>
        {mixed ? (
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {chosen.map((_, index) => (
              <li key={index} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t("setup.booster", { number: index + 1 })}</span>
                {setSelect(index, t("setup.booster", { number: index + 1 }))}
              </li>
            ))}
          </ol>
        ) : (
          <div className="max-w-xs">{setSelect(0, t("setup.set"))}</div>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-secondary">
          <Checkbox checked={mixed} onCheckedChange={(checked) => setMixed(checked === true)} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-sm font-medium">{t("setup.mixed")}</span>
            <span className="text-xs text-muted-foreground">{t("setup.mixedHint")}</span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{t("setup.whoTitle")}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {places.map(({ key, icon: Icon, title, hint }) => (
            <button
              key={key}
              type="button"
              aria-pressed={where === key}
              onClick={() => setWhere(key)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3 text-left transition hover:border-primary/60",
                where === key && "border-primary bg-primary/10",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <Icon className="size-4" aria-hidden />
                {title}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>

        {where === "ai" && (
          <>
            {playersBlock(t(kind === "draft" ? "setup.playersDraft" : "setup.playersSealed", { bots: count - 1 }))}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("setup.level")}</span>
              <div
                className="inline-flex self-start overflow-hidden rounded-lg border"
                role="group"
                aria-label={t("setup.level")}
              >
                {BOT_LEVELS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={level === value}
                    onClick={() => setLevel(value)}
                    className={cn(
                      "min-h-9 px-3 text-sm transition",
                      level === value
                        ? "bg-secondary font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tPlay(`level.${value}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("setup.levelHint")}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t("setup.oneMatch")}</p>
            <div className="flex flex-row flex-wrap items-center gap-3">
              <Button disabled={busy} onClick={start}>
                {t(kind === "draft" ? "setup.startDraft" : "setup.startSealed")}
              </Button>
              {replaces && <span className="text-xs text-muted-foreground">{t("setup.replaces")}</span>}
            </div>
          </>
        )}

        {where === "online" &&
          (!lobby.online ? (
            <p className="text-sm text-muted-foreground">{tPlay("lobby.offline")}</p>
          ) : !lobby.signedIn ? (
            <div className="flex flex-row flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t("setup.signIn")}</span>
              <Button asChild size="sm">
                <Link href="/login">{tPlay("lobby.signIn")}</Link>
              </Button>
            </div>
          ) : (
            <>
              {mine.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {mine.map((event) => (
                    <li key={event.id} className="flex flex-row flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                      <span className="font-medium">{t(`room.title.${event.kind}`)}</span>
                      <span className="text-muted-foreground">
                        {t(event.status === "waiting" ? "setup.mineWaiting" : "setup.minePlaying", {
                          players: event.seats.length,
                        })}
                      </span>
                      <Button asChild size="sm" variant="outline" className="ml-auto">
                        <Link href={`${ROOM}?id=${event.id}`}>{t("setup.mineOpen")}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {lobby.canHost ? (
                <>
                  {playersBlock(t("setup.playersOnline"))}
                  {timersBlock}
                  <p className="text-sm text-muted-foreground">{t("setup.oneMatchOnline")}</p>
                  <div className="flex flex-row flex-wrap gap-2">
                    <Button disabled={busy} onClick={createOnline}>
                      {t("setup.create")}
                    </Button>
                  </div>
                </>
              ) : (
                <PlanUpsell feature="host" />
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="limited-join">{t("setup.join")}</Label>
                <div className="flex flex-row flex-wrap gap-2">
                  <Input
                    id="limited-join"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={t("setup.joinPlaceholder")}
                    className="max-w-xs"
                  />
                  <Button
                    variant="outline"
                    disabled={!/^[a-z0-9]{4,32}$/.test(joinCode)}
                    onClick={() => router.push(`${ROOM}?id=${joinCode}`)}
                  >
                    {t("setup.joinButton")}
                  </Button>
                </div>
              </div>
            </>
          ))}

        {where === "host" &&
          (lobby.canHost ? (
            <LimitedHostPanel kind={kind} packs={chosen} hostName={name} timers={timers}>
              {timersBlock}
            </LimitedHostPanel>
          ) : (
            <PlanUpsell feature="host" />
          ))}
      </section>
    </>
  );
}
