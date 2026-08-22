"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Play, Radio } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { CONTENT_FILTERS, filterContents, type ContentFilter } from "@/lib/content/items.ts";
import type { UserContentKind } from "@/lib/types/UserContent";
import { cn } from "@/lib/utils.ts";

const ICONS = { video: Play, article: FileText, replay: Radio } as const;

export type ProfileContentCard = {
  id: string;
  kind: UserContentKind;
  title: string;
  summary?: string;
  thumbnail?: string;
  duration?: string;
  url?: string;
  publishedAt: string;
};

/**
 * Ce qu'un joueur publie.
 *
 * Les filtres agissent vraiment sur la grille — trois onglets décoratifs
 * seraient pires que pas d'onglets. Un filtre qui ne ramènerait rien reste
 * cliquable et le dit : c'est une information sur le compte, pas une panne.
 *
 * Un article se lit sur place, sur le profil, plutôt que d'ouvrir un écran
 * ailleurs ; une vidéo et un replay sortent vers leur plateforme.
 */
export default function ProfileContents({
  contents,
  profilePath,
}: {
  contents: ProfileContentCard[];
  profilePath: string;
}) {
  const t = useTranslations("Users.profile.publications");
  const [filter, setFilter] = useState<ContentFilter>("all");

  const shown = filterContents(contents, filter);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted-foreground">
          {t("count", { shown: shown.length, total: contents.length })}
        </p>

        <div className="ml-auto flex flex-wrap gap-1 rounded-[9px] border p-1">
          {CONTENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filters.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {t("emptyForFilter")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((content) => {
            const Icon = ICONS[content.kind];
            const isArticle = content.kind === "article";
            const href = isArticle
              ? `${profilePath}?tab=publications&article=${content.id}`
              : content.url;

            const body = (
              <>
                <span className="relative block h-[140px] w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-[140px] sm:w-[250px]">
                  {content.thumbnail ? (
                    // Vignette fournie par le compte : hôte non déclaré.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={content.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      <Icon className="size-8 text-muted-foreground" aria-hidden />
                    </span>
                  )}
                </span>

                <span className="flex min-w-0 flex-col gap-1.5 p-4">
                  <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3" aria-hidden />
                      {t(`kinds.${content.kind}`)}
                    </span>
                    {content.duration && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{content.duration}</span>
                      </>
                    )}
                  </span>

                  <span className="text-[18px] leading-tight font-bold">{content.title}</span>

                  {content.summary && (
                    <span className="line-clamp-2 text-sm text-pretty text-muted-foreground">
                      {content.summary}
                    </span>
                  )}
                </span>
              </>
            );

            return (
              <li key={content.id}>
                {isArticle ? (
                  <Link
                    href={href ?? profilePath}
                    className="flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:bg-accent sm:flex-row"
                  >
                    {body}
                  </Link>
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:bg-accent sm:flex-row"
                  >
                    {body}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
