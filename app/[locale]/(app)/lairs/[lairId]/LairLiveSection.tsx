import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Eye, Radio } from "lucide-react";

import { readLiveEmbed } from "@/lib/lairs/live.ts";
import type { Lair } from "@/lib/types/Lair";

import LairLiveControls from "./LairLiveControls.tsx";

/**
 * Le cadre « En direct », en tête de l'onglet Actualités.
 *
 * Deux publics, deux pages différentes : le visiteur ne voit ce bloc que
 * lorsqu'un direct tourne, et n'y voit que le lecteur ; le staff y voit en
 * plus les commandes, et — direct éteint — l'invitation à en lancer un. Un
 * lieu sans direct n'affiche donc rien du tout à ses visiteurs, plutôt qu'une
 * carte vide qui occuperait la meilleure place de la page.
 */
export default async function LairLiveSection({
  lair,
  canManageLair,
}: {
  lair: Lair;
  canManageLair: boolean;
}) {
  const [t, locale, requestHeaders] = await Promise.all([
    getTranslations("Lairs.portal.live"),
    getLocale(),
    headers(),
  ]);

  const live = lair.options?.live;
  const embed = live?.url ? readLiveEmbed(live.url, requestHeaders.get("host") ?? "localhost") : null;

  if (!embed) {
    if (!canManageLair) {
      return null;
    }

    return (
      <section className="flex flex-col gap-4 rounded-xl border border-dashed bg-card/60 p-5 sm:flex-row sm:items-center">
        <Radio className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{t("emptyTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("emptyDescription")}</p>
        </div>
        <LairLiveControls lairId={lair.id} isLive={false} />
      </section>
    );
  }

  const startedAt = live?.startedAt ? DateTime.fromISO(live.startedAt) : null;
  // La durée écoulée, arrondie à la minute : « depuis 42 min », « depuis 2 h ».
  // Une date de début brute n'apprendrait rien — ce qu'on veut savoir d'un
  // direct, c'est s'il commence ou s'il s'achève.
  const elapsed = startedAt?.isValid ? DateTime.now().diff(startedAt) : null;
  const duration =
    elapsed && elapsed.as("minutes") >= 1
      ? elapsed
          .shiftTo(...(elapsed.as("hours") >= 1 ? (["hours", "minutes"] as const) : (["minutes"] as const)))
          .mapUnits((value) => Math.floor(value))
          .reconfigure({ locale })
          .toHuman({ unitDisplay: "short" })
      : null;

  const meta = [
    duration ? t("since", { duration }) : null,
    typeof live?.viewers === "number" ? t("viewers", { count: live.viewers }) : null,
  ].filter(Boolean);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-red-500/45 bg-red-500/5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-[7px] rounded-full bg-red-500 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[.1em] text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          {t("badge")}
        </span>
        {live?.title && <h2 className="text-base font-semibold">{live.title}</h2>}
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
        )}
        {canManageLair && (
          <div className="ml-auto">
            <LairLiveControls lairId={lair.id} isLive currentUrl={live?.url} />
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[10px] border bg-black">
        <iframe
          src={embed.embedUrl}
          title={live?.title ?? t("badge")}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full"
        />
      </div>

      <a
        href={embed.channelUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
      >
        {embed.label}
      </a>

      {canManageLair && (
        <p className="flex items-center gap-2.5 border-t pt-2.5 font-mono text-[10px] text-muted-foreground">
          <Eye className="size-3.5 shrink-0" aria-hidden />
          {t("staffOnlyNotice")}
        </p>
      )}
    </section>
  );
}
