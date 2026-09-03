"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Lock, Printer } from "lucide-react";

import { getPathname } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";
import { POSTER_ZONE } from "@/lib/posters/period.ts";
import {
  POSTER_STYLE_KEYS,
  POSTER_STYLES,
  type PosterOptions,
  type PosterPeriod,
  type PosterStyleKey,
} from "@/lib/posters/styles.ts";

import { updateLairPosterSettings, type LairPosterError } from "./poster-actions.ts";

const ERROR_KEYS: Record<LairPosterError, string> = {
  INVALID: "errors.invalid",
  NOT_FOUND: "errors.notFound",
  PRO_REQUIRED: "errors.proRequired",
  FAILED: "errors.failed",
};

/** L'affiche est dessinée à cette taille ; l'aperçu la réduit à sa colonne. */
const POSTER_WIDTH = 794;
const POSTER_HEIGHT = 1123;
const PREVIEW_WIDTH = 420;

/**
 * L'onglet « Affiche » de l'écran de gestion.
 *
 * Les réglages enregistrés — style, fréquentation, logos — sont ceux du lieu ;
 * la période, elle, n'est pas un réglage : on choisit la semaine ou le mois au
 * moment de publier, et l'affiche suivante repart d'aujourd'hui.
 *
 * L'aperçu est la vraie page, dans une `iframe` réduite, et il suit chaque
 * réglage avant même son enregistrement : les paramètres d'URL de l'affiche
 * passent par-dessus ce qui est en base. Ce qui est enregistré ne sert donc
 * qu'à l'affiche ouverte sans ces paramètres — celle qu'un lieu partage.
 */
export default function LairPosterSettings({
  lairId,
  isPro,
  saved,
}: {
  lairId: string;
  isPro: boolean;
  saved: PosterOptions;
}) {
  const t = useTranslations("Lairs.manage.poster");
  const tStyles = useTranslations("Lairs.poster.styles");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const [period, setPeriod] = useState<PosterPeriod>("week");
  // Dans le fuseau des lieux, pas celui du navigateur : un gérant en voyage
  // doit voir la même semaine que son affiche.
  const [start, setStart] = useState(() => DateTime.now().setZone(POSTER_ZONE).startOf("day"));
  const [settings, setSettings] = useState<PosterOptions>(saved);
  const [stored, setStored] = useState(saved);
  const isDirty = JSON.stringify(settings) !== JSON.stringify(stored);

  const periodLabel = useMemo(() => {
    const localized = start.setLocale(locale);

    if (period === "month") {
      return localized.toFormat("LLLL yyyy");
    }

    const first = localized.startOf("week");
    const last = localized.endOf("week");

    return `${first.toFormat("d")} – ${last.toFormat("d LLLL yyyy")}`;
  }, [period, start, locale]);

  const shift = (direction: 1 | -1) =>
    setStart((current) => (period === "week" ? current.plus({ weeks: direction }) : current.plus({ months: direction })));

  const posterHref = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({
      period,
      start: start.toISODate() ?? "",
      style: settings.style,
      attendance: settings.showAttendance ? "1" : "0",
      logos: settings.gameLogos ? "1" : "0",
      ...extra,
    });

    return `${getPathname({ locale, href: `/lairs/${lairId}/affiche` })}?${query.toString()}`;
  };

  const save = () => {
    startTransition(async () => {
      const result = await updateLairPosterSettings(lairId, settings);

      if (result.success) {
        setStored(settings);
        toast.success(t("saved"));
        return;
      }

      toast.error(t(ERROR_KEYS[result.error]));
    });
  };

  const scale = PREVIEW_WIDTH / POSTER_WIDTH;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col gap-6">
        {/* La période et le contenu. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("title")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("description")}</p>
          </header>

          <div className="flex flex-col gap-2">
            <Label>{t("period.label")}</Label>
            <div role="group" aria-label={t("period.label")} className="flex w-fit gap-0.5 rounded-lg border bg-background p-[3px]">
              {(["week", "month"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  aria-pressed={period === value}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                    period === value ? "bg-primary/10 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`period.${value}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label={t("period.previous")}>
                <ChevronLeft />
              </Button>
              <span className="min-w-[12rem] text-center text-sm font-medium capitalize">{periodLabel}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label={t("period.next")}>
                <ChevronRight />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStart(DateTime.now().setZone(POSTER_ZONE).startOf("day"))}>
                {t("period.today")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Label>{t("content.label")}</Label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm">{t("content.attendance")}</span>
                <span className="text-[13px] text-muted-foreground">{t("content.attendanceHint")}</span>
              </div>
              <Switch
                checked={settings.showAttendance}
                aria-label={t("content.attendance")}
                onCheckedChange={(checked) => setSettings((current) => ({ ...current, showAttendance: checked }))}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm">{t("content.logos")}</span>
                <span className="text-[13px] text-muted-foreground">{t("content.logosHint")}</span>
              </div>
              <Switch
                checked={settings.gameLogos}
                aria-label={t("content.logos")}
                onCheckedChange={(checked) => setSettings((current) => ({ ...current, gameLogos: checked }))}
              />
            </div>
          </div>
        </section>

        {/* Le style. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("style.title")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("style.description")}</p>
          </header>

          <div className="grid gap-2 sm:grid-cols-2">
            {POSTER_STYLE_KEYS.map((key) => {
              const style = POSTER_STYLES[key];
              const locked = style.pro && !isPro;
              const selected = settings.style === key;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={locked}
                  aria-pressed={selected}
                  onClick={() => setSettings((current) => ({ ...current, style: key as PosterStyleKey }))}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-primary/50 bg-primary/5" : "hover:bg-accent",
                    locked && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex h-10 w-11 shrink-0 overflow-hidden rounded-lg border" aria-hidden>
                    {style.swatches.map((color) => (
                      <span key={color} className="flex-1" style={{ background: color }} />
                    ))}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                      {tStyles(`${key}.name`)}
                      {style.pro && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <Lock className="size-3" aria-hidden />
                          {t("style.pro")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{tStyles(`${key}.hint`)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={save} disabled={isPending || !isDirty}>
              {isPending && <Loader2 className="animate-spin" aria-hidden />}
              {t("save")}
            </Button>
          </div>
        </section>

        {/* L'export. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("export.title")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("export.description")}</p>
          </header>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={posterHref({ print: "1" })} target="_blank" rel="noreferrer">
                <Printer aria-hidden />
                {t("export.print")}
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={posterHref()} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                {t("export.open")}
              </a>
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("export.hint")}</p>
        </section>
      </div>

      {/* L'aperçu : la vraie page, réduite. */}
      <aside className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{t("preview.title")}</span>
          <span className="text-[13px] text-muted-foreground">{t("preview.size")}</span>
        </div>
        <div
          className="relative overflow-hidden rounded-md shadow-lg"
          style={{ width: PREVIEW_WIDTH, height: Math.round(POSTER_HEIGHT * scale), maxWidth: "100%" }}
        >
          <iframe
            key={posterHref()}
            src={posterHref()}
            title={t("preview.title")}
            width={POSTER_WIDTH}
            height={POSTER_HEIGHT}
            className="absolute left-0 top-0 border-0"
            style={{ transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
          />
        </div>
      </aside>
    </div>
  );
}
