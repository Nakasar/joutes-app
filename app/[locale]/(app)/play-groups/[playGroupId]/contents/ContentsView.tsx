import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { FileText, Play, Plus, Radio } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";

import { viewHref } from "../views.ts";
import {
  memberName,
  readGroupMembers,
  requirePlayGroup,
  requirePlayGroupMember,
  sortContents,
} from "../group-data.ts";

const ICONS = { video: Play, article: FileText, replay: Radio } as const;

/**
 * Ce que le groupe publie, vu de l'intérieur.
 *
 * La vitrine en montre les cartes ; ici, chacune est un lien vers son écriture.
 * N'importe quel membre publie — écrire un compte rendu de tournoi ou déposer
 * sa vidéo n'est pas un acte de gouvernance —, mais on ne reprend que ce qu'on
 * a écrit, sauf à être admin.
 */
export default async function ContentsView({ playGroupId }: { playGroupId: string }) {
  const [group, viewer, members, t, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.contents"),
    getLocale(),
  ]);

  const contents = sortContents(group.options?.contents ?? []);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("summary", { count: contents.length })}</p>
        </div>

        <Button size="sm" asChild>
          <Link href={viewHref(playGroupId, "contents", { contentId: "new" })}>
            <Plus aria-hidden />
            {t("create")}
          </Link>
        </Button>
      </header>

      {contents.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {contents.map((content) => {
            const Icon = ICONS[content.kind];
            const date = DateTime.fromISO(content.publishedAt).setLocale(locale);
            const editable = viewer.canManage || content.authorId === viewer.userId;

            const card = (
              <>
                {content.thumbnail ? (
                  <span className="block h-[120px] w-full shrink-0 overflow-hidden bg-muted">
                    {/* `next/image` refuserait l'hôte : cette adresse est saisie à la main,
                        et `next.config.ts` n'autorise que le stockage blob. */}
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
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {[memberName(members, content.authorId), date.isValid ? date.toFormat("d LLLL") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </>
            );

            const className = "flex flex-col overflow-hidden rounded-xl border bg-card";

            return editable ? (
              <Link
                key={content.id}
                href={viewHref(playGroupId, "contents", { contentId: content.id })}
                className={`${className} transition-shadow hover:shadow-lg`}
              >
                {card}
              </Link>
            ) : (
              <article key={content.id} className={className}>
                {card}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
