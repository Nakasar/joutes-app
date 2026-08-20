import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Radio } from "lucide-react";

import { readLiveEmbed } from "@/lib/media/live-embed.ts";
import type { PlayGroupLiveStream } from "@/lib/types/PlayGroup";

import PlayGroupLiveControls from "./PlayGroupLiveControls.tsx";

/** « depuis 42 min », « depuis 2 h » — une heure de début brute n'apprendrait rien. */
export function readElapsed(startedAt: string | undefined, locale: string): string | null {
  const start = startedAt ? DateTime.fromISO(startedAt) : null;
  const elapsed = start?.isValid ? DateTime.now().diff(start) : null;

  if (!elapsed || elapsed.as("minutes") < 1) {
    return null;
  }

  return elapsed
    .shiftTo(...(elapsed.as("hours") >= 1 ? (["hours", "minutes"] as const) : (["minutes"] as const)))
    .mapUnits((value) => Math.floor(value))
    .reconfigure({ locale })
    .toHuman({ unitDisplay: "short" });
}

/** La pastille « EN DIRECT », partagée par le hub et la vitrine. */
export function LiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full bg-red-500 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[.1em] text-white uppercase">
      <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Le direct en tête de l'Établi.
 *
 * Absent quand personne ne diffuse — sauf pour un membre, qui garde
 * l'invitation à déclarer le sien : une carte vide occuperait la meilleure
 * place de la page pour ne rien dire.
 */
export default async function PlayGroupLiveSection({
  playGroupId,
  lives,
  memberNames,
  currentUserId,
  canManage,
}: {
  playGroupId: string;
  lives: PlayGroupLiveStream[];
  memberNames: Record<string, string>;
  currentUserId: string | null;
  /** Un admin retire n'importe quel direct ; un membre, seulement le sien. */
  canManage: boolean;
}) {
  const [t, locale, requestHeaders] = await Promise.all([
    getTranslations("PlayGroups.hub.live"),
    getLocale(),
    headers(),
  ]);

  const host = requestHeaders.get("host") ?? "localhost";
  const first = lives[0];
  const embed = first ? readLiveEmbed(first.url, host) : null;

  if (!first || !embed) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-dashed bg-card/60 p-5 sm:flex-row sm:items-center">
        <Radio className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{t("emptyTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("emptyDescription")}</p>
        </div>
        <PlayGroupLiveControls playGroupId={playGroupId} />
      </section>
    );
  }

  const duration = readElapsed(first.startedAt, locale);
  const streamer = memberNames[first.memberId] ?? t("aMember");
  const meta = [duration ? t("since", { duration }) : null, typeof first.viewers === "number" ? t("viewers", { count: first.viewers }) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-red-500/45 bg-red-500/5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <LiveBadge label={t("badge")} />
        <h2 className="text-base font-semibold">{first.title ? `${streamer} — ${first.title}` : streamer}</h2>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        {lives.length > 1 && (
          <p className="font-mono text-[11px] text-muted-foreground">{t("alsoLive", { count: lives.length - 1 })}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-[10px] border bg-black">
        <iframe
          src={embed.embedUrl}
          title={first.title ?? t("badge")}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <a
          href={embed.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
        >
          {embed.label}
        </a>
        <PlayGroupLiveControls
          playGroupId={playGroupId}
          liveId={canManage || first.memberId === currentUserId ? first.id : undefined}
        />
      </div>
    </section>
  );
}
