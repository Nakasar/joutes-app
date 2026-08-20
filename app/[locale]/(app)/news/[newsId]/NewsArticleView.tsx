import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getNewsById } from "@/lib/db/news.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { Metadata } from "next";
import { DateTime } from "luxon";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, ExternalLink, Pencil, Tag, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import Image from "next/image";
import LikeButton from "./LikeButton.tsx";
import ReportButton from "@/components/ReportButton.tsx";
import NewsContent from "./NewsContent.tsx";
import NewsLanguageLinks from "./NewsLanguageLinks.tsx";
import NewsTranslateMenu from "./NewsTranslateMenu.tsx";
import StaleTranslationWarning from "@/components/StaleTranslationWarning.tsx";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards.ts";
import {
  availableNewsLangs,
  localizeNews,
  newsOriginalLang,
  newsPath,
  resolveNewsLang,
} from "@/lib/news/localize.ts";
import { locales, type Locale } from "@/i18n/config.ts";
import { UserBadges } from "@/components/UserBadges.tsx";

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
  // Même piège que dans le corps, et il faut le désarmer deux fois : les
  // métadonnées s'exécutent hors de la frontière de la page, avec leur propre
  // lecture de l'actualité — donc leur propre passage du pilote Mongo sur
  // l'horloge.
  await connection();

  const news = await getNewsById(newsId);
  if (!news) return { title: "Actualité introuvable" };

  const available = availableNewsLangs(news);
  if (requested && !available.includes(requested)) return { title: "Actualité introuvable" };

  const lang = requested ?? resolveNewsLang(news, (await getLocale()) as Locale);
  const localized = localizeNews(news, lang);
  const original = newsOriginalLang(news);

  return {
    title: localized.title.text,
    description: localized.summary.text,
    openGraph: {
      title: localized.title.text,
      description: localized.summary.text,
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
  // Le pilote Mongo touche à l'horloge en lisant l'actualité, ce qu'un prérendu
  // ne sait pas figer. Aucune frontière n'y change rien : c'est de la sync-IO,
  // pas une donnée de requête. Séquencer la session avant la base ne le désarme
  // pas non plus — vérifié. `connection()` marque explicitement ce rendu comme
  // lié à la requête, ce qu'il est déjà : il lit la session juste après.
  await connection();

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
    ? await resolveCardMentions(new ObjectId(singleGame.id), [localized.content.text])
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
      {/*
        Pas de `lang` sur l'article entier : le repli étant champ par champ,
        titre, résumé et corps ne sont pas forcément dans la même langue, et
        une étiquette unique en mentirait sur au moins un — la synthèse vocale
        lirait alors du français avec une prononciation anglaise.
      */}
      <article className="space-y-6">
        {/* Bannière */}
        {news.banner && (
          <div className="relative w-full rounded-xl overflow-hidden aspect-[3/1] max-h-64">
            <Image
              src={news.banner}
              alt={`Bannière : ${localized.title.text}`}
              fill
              className="object-cover"
              unoptimized
              priority
            />
          </div>
        )}

        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight" lang={localized.title.lang}>
            {localized.title.text}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{date}</span>
            <span>·</span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Par {authorName}
              <UserBadges badges={news.author?.badges} />
            </span>
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
          <p
            className="text-lg text-muted-foreground border-l-4 border-primary pl-4"
            lang={localized.summary.lang}
          >
            {localized.summary.text}
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
        <div lang={localized.content.lang}>
          <NewsContent
            content={localized.content.text}
            cardIdByName={cardIdByName}
            cardsById={cardsById}
            gameSlug={gameSlug}
          />
        </div>

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
