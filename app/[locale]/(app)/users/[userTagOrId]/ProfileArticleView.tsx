import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ArrowLeft } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import GameMarkdown from "@/components/GameMarkdown.tsx";
import ReportButton from "@/components/ReportButton.tsx";
import { getUserContentById } from "@/lib/db/user-contents.ts";
import { userProfilePath } from "@/lib/users/handle.ts";

import { requireProfile } from "./profile-data.ts";

/**
 * Un article d'un joueur, lu sur Joutes.
 *
 * Publique comme la vitrine dont elle vient : un article écrit pour être lu
 * n'a pas de raison d'attendre une connexion. Seuls les articles ont cette
 * page — une vidéo et un replay renvoient à leur plateforme.
 *
 * Trois conditions, et pas une de moins : l'article existe, il est public, et
 * il appartient bien au profil affiché. Sans la troisième, l'adresse d'un
 * profil quelconque servirait à lire l'article de n'importe qui — ce qui n'est
 * pas une fuite (il est public) mais attribuerait un texte au mauvais auteur.
 */
export default async function ProfileArticleView({
  userTagOrId,
  contentId,
}: {
  userTagOrId: string;
  contentId: string;
}) {
  const [subject, content, t, locale] = await Promise.all([
    requireProfile(userTagOrId),
    getUserContentById(contentId),
    getTranslations("Users.profile.publications"),
    getLocale(),
  ]);

  if (
    !content ||
    content.authorId !== subject.user.id ||
    content.visibility !== "public" ||
    content.kind !== "article" ||
    !content.body
  ) {
    notFound();
  }

  const date = DateTime.fromISO(content.publishedAt).setLocale(locale);

  return (
    <article className="container mx-auto max-w-3xl px-4 py-8">
      <Button variant="outline" size="sm" asChild>
        <Link href={userProfilePath(subject.user)}>
          <ArrowLeft aria-hidden />
          {subject.displayName}
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

      <h1 className="mt-6 text-[32px] leading-tight font-extrabold tracking-[-0.02em]">
        {content.title}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="font-mono text-[11px] tracking-[.06em] text-muted-foreground uppercase">
          {[t("kinds.article"), subject.tag, date.isValid ? date.toFormat("d LLLL yyyy") : null]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <ReportButton contentType="user-content" contentId={content.id} />
      </div>

      {content.summary && (
        <p className="mt-4 text-base leading-[1.55] text-pretty text-muted-foreground">
          {content.summary}
        </p>
      )}

      <div className="prose prose-sm dark:prose-invert mt-6 max-w-none">
        <GameMarkdown markdown={content.body} gameSlug="" ruleLang={locale === "fr" ? "fr" : "en"} />
      </div>
    </article>
  );
}
