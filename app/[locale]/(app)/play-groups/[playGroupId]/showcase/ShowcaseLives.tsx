"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils.ts";

export type ShowcaseLive = {
  id: string;
  title: string;
  streamer: string;
  gameName?: string;
  viewers?: number;
  since?: string;
  embedUrl: string;
  channelUrl: string;
  label: string;
  platform: string;
};

/**
 * Le bloc des directs de la vitrine.
 *
 * Un lecteur principal, et les autres en vignettes : cliquer une vignette la
 * passe en grand. Trois directs simultanés au plus — au-delà, la grille
 * deviendrait une liste, et plus personne ne saurait lequel regarder.
 */
export default function ShowcaseLives({ lives, groupName }: { lives: ShowcaseLive[]; groupName: string }) {
  const t = useTranslations("PlayGroups.showcase.live");
  const [mainId, setMainId] = useState(lives[0]?.id);

  const main = lives.find((live) => live.id === mainId) ?? lives[0];
  const others = lives.filter((live) => live.id !== main?.id);

  if (!main) {
    return null;
  }

  const totalViewers = lives.reduce((total, live) => total + (live.viewers ?? 0), 0);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-red-500/45 bg-red-500/5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full bg-red-500 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[.1em] text-white uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          {t("badge")}
        </span>
        <h2 className="text-[22px] font-bold">{t("title", { group: groupName, count: lives.length })}</h2>
        {totalViewers > 0 && (
          <p className="ml-auto text-[13px] text-muted-foreground">{t("totalViewers", { count: totalViewers })}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-[10px] border bg-black">
            <iframe
              key={main.id}
              src={main.embedUrl}
              title={main.title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{main.title}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {[main.gameName, main.viewers ? t("viewers", { count: main.viewers }) : null, main.since]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <a
              href={main.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-3 py-1.5 text-[13px] transition-colors hover:bg-accent"
            >
              {t("openOn", { platform: main.platform })}
            </a>
          </div>
        </div>

        {others.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">{t("alsoLive")}</p>

            {others.map((live) => (
              <button
                key={live.id}
                type="button"
                onClick={() => setMainId(live.id)}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border bg-card p-2.5 text-left transition-colors hover:bg-accent",
                )}
              >
                <span className="flex h-[60px] w-[104px] shrink-0 items-center justify-center rounded-[6px] bg-black/60">
                  <Play className="size-5 text-red-400" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{live.title}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {[live.gameName, live.viewers ? t("viewers", { count: live.viewers }) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="block font-mono text-[11px] text-[var(--group-accent-text)]">{live.platform}</span>
                </span>
              </button>
            ))}

            <p className="font-mono text-[11px] text-muted-foreground">{t("clickHint")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
