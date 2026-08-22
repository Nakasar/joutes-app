"use client";

import { useState } from "react";
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
  /** ISO 8601 — ce sur quoi la liste se trie avant d'être affichée. */
  publishedAt: string;
  publishedLabel: string | null;
  /**
   * Le membre qui l'a publié, quand le contenu vient de **lui** et non du
   * groupe.
   *
   * C'est ce qui distingue les deux à l'œil : ce que le groupe publie porte sa
   * signature à lui, ce qu'un membre publie sur sa propre vitrine et qui
   * remonte ici porte la sienne. Sans cette ligne, un groupe paraîtrait
   * signer des vidéos qu'il n'a pas choisies.
   */
  authorName?: string;
};

/**
 * Ce que le groupe publie — et ce que ses membres publient publiquement.
 *
 * Les deux listes se mêlent, triées par date : un groupe est autant ce que ses
 * membres font que ce qu'il annonce. Un contenu de membre porte son nom, celui
 * du groupe n'en porte pas — c'est ce qui les distingue sans deux sections.
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
                  <span className="block h-[120px] w-full shrink-0 overflow-hidden bg-muted">
                    {/* Une adresse saisie à la publication : le composant image
                        de Next refuserait l'hôte, seul le stockage blob étant
                        déclaré dans `next.config.ts`. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={content.thumbnail} alt="" className="size-full object-cover" />
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
                  {(content.publishedLabel || content.authorName) && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {[content.authorName ? t("byMember", { name: content.authorName }) : null, content.publishedLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
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
