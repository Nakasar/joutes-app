import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ArrowLeft } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import GameMarkdown from "@/components/GameMarkdown.tsx";
import { readPlayGroupAccent } from "@/lib/play-groups/theme.ts";
import { viewHref } from "../views.ts";

import { memberName, readGroupMembers, requirePlayGroup } from "../group-data.ts";

/**
 * Un article du groupe, lu sur Joutes.
 *
 * Publique comme la vitrine dont elle vient : un article écrit pour être lu
 * n'a pas de raison d'attendre une connexion. Seuls les articles ont cette
 * page — une vidéo et un replay renvoient à leur plateforme.
 */
export default async function ArticleView({
  playGroupId,
  contentId,
}: {
  playGroupId: string;
  contentId: string;
}) {
  const [group, members, t, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.contents"),
    getLocale(),
  ]);

  const content = group.options?.contents?.find((item) => item.id === contentId);
  if (!content || content.kind !== "article" || !content.body) {
    notFound();
  }

  const accent = readPlayGroupAccent(group);
  const date = DateTime.fromISO(content.publishedAt).setLocale(locale);
  const ruleLang = locale === "fr" ? "fr" : "en";

  return (
    <div className="play-group-theme" style={accent.style}>
      <article className="container mx-auto max-w-3xl px-4 py-8">
        <Button variant="outline" size="sm" asChild>
          <Link href={viewHref(playGroupId, "showcase")}>
            <ArrowLeft aria-hidden />
            {group.name}
          </Link>
        </Button>

        {content.thumbnail && (
          <div className="mt-6 h-56 w-full overflow-hidden rounded-xl border bg-muted">
            {/* Une adresse saisie à la publication : le composant image de Next
                refuserait l'hôte, seul le stockage blob étant déclaré. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.thumbnail} alt="" className="size-full object-cover" />
          </div>
        )}

        <h1 className="mt-6 text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{content.title}</h1>

        <p className="mt-2 font-mono text-[11px] tracking-[.06em] text-muted-foreground uppercase">
          {[
            t("kind.article"),
            memberName(members, content.authorId),
            date.isValid ? date.toFormat("d LLLL yyyy") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {content.summary && (
          <p className="mt-4 text-base leading-[1.55] text-pretty text-muted-foreground">{content.summary}</p>
        )}

        <div className="prose prose-sm dark:prose-invert mt-6 max-w-none">
          <GameMarkdown markdown={content.body} gameSlug="" ruleLang={ruleLang} />
        </div>
      </article>
    </div>
  );
}
