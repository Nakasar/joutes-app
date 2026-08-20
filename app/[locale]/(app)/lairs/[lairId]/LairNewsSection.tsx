import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Pin } from "lucide-react";

import GameMarkdown from "@/components/GameMarkdown.tsx";
import { externalUrl } from "@/lib/lairs/urls.ts";
import type { LairNewsItem } from "@/lib/types/Lair";

/** Les annonces les plus récentes d'abord, l'épinglée mise à part. */
function sortNews(news: LairNewsItem[]): { pinned: LairNewsItem | null; rest: LairNewsItem[] } {
  const sorted = [...news].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const pinnedIndex = sorted.findIndex((item) => item.pinned);

  if (pinnedIndex === -1) {
    return { pinned: null, rest: sorted };
  }

  return {
    pinned: sorted[pinnedIndex],
    rest: sorted.filter((_, index) => index !== pinnedIndex),
  };
}

function formatDate(value: string, locale: string): string | null {
  const date = DateTime.fromISO(value).setLocale(locale);
  return date.isValid ? date.toFormat("d LLLL") : null;
}

/**
 * Les actualités du lieu.
 *
 * Une seule annonce peut être épinglée : elle prend la largeur, teintée de
 * l'accent, parce qu'elle porte en général ce qui change le programme — une
 * fermeture, un report. Les autres suivent en deux colonnes, par date.
 *
 * Section absente si le lieu n'a rien publié : une rubrique vide donnerait
 * l'impression d'un lieu à l'arrêt.
 */
export default async function LairNewsSection({ news }: { news: LairNewsItem[] }) {
  if (news.length === 0) {
    return null;
  }

  const [t, locale] = await Promise.all([getTranslations("Lairs.portal.news"), getLocale()]);
  const { pinned, rest } = sortNews(news);
  const ruleLang = locale === "fr" ? "fr" : "en";

  // Le lien contextuel d'une annonce est saisi par le lieu : hors http(s), il
  // n'est pas rendu du tout.
  const pinnedLink = externalUrl(pinned?.link);

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[22px] font-bold">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      {pinned && (
        <article className="flex gap-4 rounded-xl border border-[var(--lair-accent-32)] bg-[image:var(--lair-accent-sweep)] p-5">
          <Pin className="mt-0.5 size-[18px] shrink-0 text-[var(--lair-accent-text)]" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-semibold">{pinned.title}</h3>
              <span className="rounded-full bg-[var(--lair-accent-20)] px-1.5 py-0.5 font-mono text-[10px] tracking-[.06em] text-[var(--lair-accent-text)]">
                {t("pinned")}
              </span>
            </div>

            {pinned.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-[1.55]">
                <GameMarkdown markdown={pinned.content} gameSlug="" ruleLang={ruleLang} />
              </div>
            ) : (
              pinned.summary && (
                <p className="text-sm leading-[1.55] text-pretty text-muted-foreground">{pinned.summary}</p>
              )
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <time className="font-mono text-[11px] text-muted-foreground" dateTime={pinned.publishedAt}>
                {formatDate(pinned.publishedAt, locale)}
              </time>
              {pinnedLink && (
                <a
                  href={pinnedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-[var(--lair-accent-text)] hover:underline"
                >
                  {pinned.linkLabel ?? t("readMore")}
                </a>
              )}
            </div>
          </div>
        </article>
      )}

      {rest.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {rest.map((item) => (
            <NewsCard key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewsCard({ item, locale }: { item: LairNewsItem; locale: string }) {
  // Le lien d'une annonce est saisi par le lieu : hors http(s), la carte reste
  // une carte plutôt que de devenir un lien à protocole arbitraire.
  const link = externalUrl(item.link);

  const body = (
    <>
      {item.banner && (
        <div className="relative h-[120px] w-full shrink-0 overflow-hidden bg-muted">
          <Image
            src={item.banner}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 400px"
          />
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        {item.category && (
          <p className="font-mono text-[11px] tracking-[.08em] text-[var(--lair-accent-text)] uppercase">
            {item.category}
          </p>
        )}
        <h3 className="text-base font-semibold">{item.title}</h3>
        {item.summary && (
          <p className="text-[13px] leading-[1.5] text-pretty text-muted-foreground">{item.summary}</p>
        )}
        <time className="font-mono text-[11px] text-muted-foreground" dateTime={item.publishedAt}>
          {formatDate(item.publishedAt, locale)}
        </time>
      </div>
    </>
  );

  const className =
    "flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg";

  return link ? (
    <a href={link} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <article className={className}>{body}</article>
  );
}
