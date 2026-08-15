import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getNewsById } from "@/lib/db/news";
import { hasPermission } from "@/lib/db/permissions";
import { Metadata } from "next";
import { DateTime } from "luxon";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil, Tag, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import LikeButton from "./LikeButton";
import ReportButton from "@/components/ReportButton";
import NewsContent from "./NewsContent";
import NewsLanguageLinks from "./NewsLanguageLinks";
import NewsTranslateMenu from "./NewsTranslateMenu";
import StaleTranslationWarning from "@/components/StaleTranslationWarning";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards";
import {
  availableNewsLangs,
  localizeNews,
  newsOriginalLang,
  newsPath,
  resolveNewsLang,
} from "@/lib/news/localize";
import { locales, type Locale } from "@/i18n/config";

/**
 * La page d'une actualité, dans une langue.
 *
 * Deux adresses y mènent : `/news/:id`, qui sert la langue de l'interface du
 * lecteur, et `/news/:id/:lang`, qui en sert une précise. C'est la même page —
 * seule la façon de choisir la langue change, d'où ce composant partagé plutôt
 * que deux rendus à garder d'accord.
 *
 * La langue est résolue **sur le serveur** : chaque version a son adresse, donc
 * peut être partagée, mise en cache et indexée. C'est ce qui distingue les
 * actualités des politiques et des quizz, dont le sélecteur de langue vit dans
 * le navigateur.
 */

/**
 * Métadonnées d'une actualité dans une langue.
 *
 * `alternates.languages` déclare les autres versions : sans lui, un moteur qui
 * trouve la page anglaise et la française y verrait deux pages concurrentes sur
 * le même sujet plutôt que deux traductions l'une de l'autre.
 */
export async function buildNewsMetadata(newsId: string, requested?: Locale): Promise<Metadata> {
  const news = await getNewsById(newsId);
  if (!news) return { title: "Actualité introuvable" };

  const available = availableNewsLangs(news);
  if (requested && !available.includes(requested)) return { title: "Actualité introuvable" };

  const lang = requested ?? resolveNewsLang(news, (await getLocale()) as Locale);
  const localized = localizeNews(news, lang);
  const original = newsOriginalLang(news);

  return {
    title: localized.title,
    description: localized.summary,
    openGraph: {
      title: localized.title,
      description: localized.summary,
      locale: lang,
    },
    alternates: {
      canonical: newsPath(newsId, lang, original),
      languages: Object.fromEntries(
        available.map((available) => [available, newsPath(newsId, available, original)])
      ),
    },
  };
}

type Props = {
  newsId: string;
  /**
   * La langue demandée par l'adresse. Sans elle, celle de l'interface du
   * lecteur décide, et la VO prend le relais si l'actualité n'y est pas.
   */
  requestedLang?: Locale;
};

export default async function NewsArticleView({ newsId, requestedLang }: Props) {
  const [session, news, canWrite, interfaceLocale] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getNewsById(newsId),
    hasPermission("news:update").catch(() => false),
    getLocale(),
  ]);

  if (!news) {
    notFound();
  }

  const originalLang = newsOriginalLang(news);
  const availableLangs = availableNewsLangs(news);

  // Une adresse qui promet une langue que l'actualité n'a pas ne renvoie pas
  // un autre texte à sa place : elle n'existe pas. C'est ce qui rend
  // `/news/:id/:lang` fiable — chaque adresse servie porte bien cette langue.
  if (requestedLang && !availableLangs.includes(requestedLang)) {
    notFound();
  }

  const localized = localizeNews(news, requestedLang ?? resolveNewsLang(news, interfaceLocale as Locale));

  // Le style des mots-clés s'applique quel que soit le jeu, mais résoudre les
  // mentions `[Nom de carte]` demande un jeu unique : on s'en abstient plutôt
  // que de deviner pour une actualité multi-jeux.
  const singleGame = news.games?.length === 1 ? news.games[0] : undefined;
  const { cardIdByName, cardsById } = singleGame
    ? await resolveCardMentions(new ObjectId(singleGame.id), [localized.content])
    : { cardIdByName: {}, cardsById: {} };
  const gameSlug = singleGame?.slug ?? "riftbound";

  const date = DateTime.fromJSDate(new Date(news.createdAt))
    .setLocale(localized.lang)
    .toLocaleString(DateTime.DATE_FULL);

  const authorName =
    news.author?.displayName && news.author?.discriminator
      ? `${news.author.displayName}#${news.author.discriminator}`
      : "Auteur inconnu";

  const translatedLangs = availableLangs.filter((lang) => lang !== originalLang);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/news">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux actualités
          </Link>
        </Button>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <NewsTranslateMenu
              newsId={newsId}
              originalLang={originalLang}
              translatedLangs={translatedLangs}
              allLangs={[...locales]}
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/news/${newsId}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Modifier
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* En-tête */}
      <article className="space-y-6" lang={localized.lang}>
        {/* Bannière */}
        {news.banner && (
          <div className="relative w-full rounded-xl overflow-hidden aspect-[3/1] max-h-64">
            <Image
              src={news.banner}
              alt={`Bannière : ${localized.title}`}
              fill
              className="object-cover"
              unoptimized
              priority
            />
          </div>
        )}

        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">{localized.title}</h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{date}</span>
            <span>·</span>
            <span>Par {authorName}</span>
          </div>

          <NewsLanguageLinks
            newsId={newsId}
            availableLangs={availableLangs}
            originalLang={originalLang}
            current={localized.lang}
          />

          {localized.isStale && (
            <StaleTranslationWarning message="Cette traduction est antérieure à la dernière modification du texte d'origine : certains passages peuvent être dépassés." />
          )}

          {/* Résumé */}
          <p className="text-lg text-muted-foreground border-l-4 border-primary pl-4">
            {localized.summary}
          </p>

          {/*
            Une actualité reprise d'ailleurs dit d'où elle vient, et y renvoie.
            Annoncé avant le corps plutôt qu'en note de bas de page : le
            lecteur doit savoir qui parle avant de lire, pas après.
          */}
          {news.source && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Article publié à l&apos;origine sur</span>
              <a
                href={news.source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                {news.source.name}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Jeux et tags */}
          {(news.games?.length || news.tags.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {news.games?.map((g) => (
                <Badge key={g.id} variant="secondary" className="gap-1">
                  <Gamepad2 className="h-3 w-3" />
                  {g.name}
                </Badge>
              ))}
              {news.tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1">
                  <Tag className="h-3 w-3" />
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </header>

        {/* Contenu markdown */}
        <NewsContent
          content={localized.content}
          cardIdByName={cardIdByName}
          cardsById={cardsById}
          gameSlug={gameSlug}
        />

        {/* Like */}
        <footer className="pt-6 border-t flex flex-wrap items-center justify-between gap-2">
          <LikeButton
            newsId={news.id}
            initialLiked={news.userHasLiked ?? false}
            initialCount={news.likesCount}
            isLoggedIn={!!session?.user}
          />
          <ReportButton contentType="news" contentId={news.id} withLabel />
        </footer>
      </article>
    </div>
  );
}
