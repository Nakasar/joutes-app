"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { FileText, Play, Radio } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";
import type { PlayGroupContentKind } from "@/lib/types/PlayGroup";

const FILTERS = ["all", "video", "article", "replay"] as const;

const ICONS = { video: Play, article: FileText, replay: Radio } as const;

export type ShowcaseContent = {
  id: string;
  kind: PlayGroupContentKind;
  title: string;
  summary?: string;
  thumbnail?: string;
  duration?: string;
  url?: string;
  /** Renseigné pour un article : la vitrine le lit sur place. */
  href?: string;
  publishedLabel: string | null;
};

/**
 * Ce que le groupe publie.
 *
 * Les filtres agissent vraiment sur la grille — trois onglets décoratifs
 * seraient pires que pas d'onglets. Un filtre qui ne ramènerait rien reste
 * cliquable et le dit : c'est une information sur le groupe, pas une panne.
 */
export default function ShowcaseContents({ contents }: { contents: ShowcaseContent[] }) {
  const t = useTranslations("PlayGroups.showcase.contents");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const shown = filter === "all" ? contents : contents.filter((content) => content.kind === filter);

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-bold">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">
          {t("count", { shown: shown.length, total: contents.length })}
        </p>

        <div className="ml-auto flex flex-wrap gap-1 rounded-[9px] border p-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
                filter === value
                  ? "bg-[var(--group-accent-16)] font-semibold text-[var(--group-accent-text)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filter.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((content) => {
            const Icon = ICONS[content.kind];

            const body = (
              <>
                {content.thumbnail ? (
                  <span className="relative block h-[120px] w-full shrink-0 overflow-hidden bg-muted">
                    <Image
                      src={content.thumbnail}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 360px"
                    />
                  </span>
                ) : (
                  <span className="flex h-[120px] w-full shrink-0 items-center justify-center bg-[var(--group-accent-10)]">
                    <Icon className="size-8 text-[var(--group-accent-text)]" aria-hidden />
                  </span>
                )}

                <span className="flex flex-col gap-1.5 p-4">
                  <span className="font-mono text-[11px] tracking-[.08em] text-[var(--group-accent-text)] uppercase">
                    {[t(`kind.${content.kind}`), content.duration].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-[15px] font-semibold">{content.title}</span>
                  {content.summary && (
                    <span className="text-[13px] leading-[1.5] text-pretty text-muted-foreground">{content.summary}</span>
                  )}
                  {content.publishedLabel && (
                    <span className="font-mono text-[11px] text-muted-foreground">{content.publishedLabel}</span>
                  )}
                </span>
              </>
            );

            const className =
              "flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg";

            if (content.href) {
              return (
                <Link key={content.id} href={content.href} className={className}>
                  {body}
                </Link>
              );
            }

            if (content.url) {
              return (
                <a
                  key={content.id}
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {body}
                </a>
              );
            }

            return (
              <article key={content.id} className={className}>
                {body}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
