"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
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
import { cn } from "@/lib/utils";

const TABLE_SIZES = [2, 4, 6, 8];

/**
 * Les réglages d'un scellé ou d'un draft contre des IA : les boosters, le
 * nombre de joueurs et le niveau des IA. L'évènement est créé par le moteur
 * dans le navigateur, puis gardé dans `localStorage`.
 */
export function LimitedSetup({ kind, name, replaces }: { kind: LimitedKind; name: string; replaces: boolean }) {
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
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("setup.players")}</span>
          <div
            className="inline-flex self-start overflow-hidden rounded-lg border"
            role="group"
            aria-label={t("setup.players")}
          >
            {TABLE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={count === size}
                onClick={() => setPlayers(size)}
                className={cn(
                  "min-h-9 min-w-11 px-3 text-sm transition",
                  count === size
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {size}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(kind === "draft" ? "setup.playersDraft" : "setup.playersSealed", { bots: count - 1 })}
          </p>
        </div>
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
      </section>
    </>
  );
}
