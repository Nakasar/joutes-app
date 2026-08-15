import { defaultLocale, locales, type Locale } from "@/i18n/config";
import type { News, NewsTranslation } from "@/lib/types/News";

/**
 * Lire une actualité dans une langue.
 *
 * Contrairement aux politiques et aux quizz, dont la langue se choisit dans un
 * sélecteur côté navigateur, celle d'une actualité tient dans son adresse :
 * `/news/:id` sert la langue de l'interface, `/news/:id/:lang` une langue
 * précise. La résolution se fait donc sur le serveur, avant le rendu — d'où ce
 * module, sans accès à la base ni au réseau, et couvert par ses tests.
 */

export type LocalizedNews = {
  /** La langue effectivement servie. */
  lang: Locale;
  /** Faux quand c'est la VO qui est rendue. */
  isTranslation: boolean;
  title: string;
  summary: string;
  content: string;
  /**
   * Vrai quand la traduction est antérieure à la dernière modification de la
   * VO : elle est peut-être dépassée, et le lecteur doit le savoir.
   */
  isStale: boolean;
};

/** Un texte traduit mais blanc n'est pas une traduction : la VO reprend la main. */
function pick(translated: string | undefined, original: string): string {
  const trimmed = translated?.trim();
  return trimmed ? translated! : original;
}

/** La VO d'une actualité, `fr` pour celles écrites avant que la langue soit notée. */
export function newsOriginalLang(news: Pick<News, "originalLang">): Locale {
  return news.originalLang ?? defaultLocale;
}

/**
 * Les langues dans lesquelles l'actualité se lit vraiment : sa VO, et les
 * traductions qui portent au moins un texte. Une traduction entièrement vide
 * n'en est pas une — elle n'aurait qu'une page de VO à offrir, sous une adresse
 * qui promettrait autre chose.
 *
 * L'ordre suit celui de `locales`, pour que le sélecteur ne bouge pas d'une
 * actualité à l'autre, la VO en tête.
 */
export function availableNewsLangs(news: Pick<News, "originalLang" | "translations">): Locale[] {
  const original = newsOriginalLang(news);
  const translated = new Set(
    (news.translations ?? [])
      .filter((tr) => hasAnyText(tr))
      .map((tr) => tr.lang)
      .filter((lang) => lang !== original)
  );

  return [original, ...locales.filter((lang) => translated.has(lang))];
}

/**
 * Comparaison de dates tolérante à la traversée du JSON : côté serveur ce sont
 * des `Date`, côté navigateur les mêmes champs arrivent en chaînes ISO. Les
 * comparer sans les normaliser marcherait par accident tant que les deux sont
 * du même bord, et se tromperait le jour où ils ne le sont plus.
 */
function isBefore(a: Date | string | undefined, b: Date | string | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() < new Date(b).getTime();
}

function hasAnyText(translation: NewsTranslation): boolean {
  return !!(translation.title?.trim() || translation.summary?.trim() || translation.content?.trim());
}

/**
 * La langue à servir à qui n'en a pas demandé une : celle de son interface si
 * l'actualité y existe, sinon la VO.
 */
export function resolveNewsLang(
  news: Pick<News, "originalLang" | "translations">,
  preferred: Locale | undefined
): Locale {
  const available = availableNewsLangs(news);
  return preferred && available.includes(preferred) ? preferred : available[0];
}

/**
 * L'actualité dans une langue donnée.
 *
 * Le repli est **champ par champ** : une traduction commencée montre ce qui est
 * traduit et laisse le reste en VO, plutôt que de tout renvoyer en VO. C'est la
 * règle des quizz, et elle vaut ici pour la même raison — un résumé pas encore
 * écrit ne doit pas emporter le corps avec lui.
 */
export function localizeNews(
  news: Pick<News, "title" | "summary" | "content" | "originalLang" | "contentUpdatedAt" | "translations">,
  lang: Locale
): LocalizedNews {
  const original = newsOriginalLang(news);
  const translation = lang === original ? undefined : news.translations?.find((tr) => tr.lang === lang);

  if (!translation || !hasAnyText(translation)) {
    return {
      lang: original,
      isTranslation: false,
      title: news.title,
      summary: news.summary,
      content: news.content,
      isStale: false,
    };
  }

  return {
    lang,
    isTranslation: true,
    title: pick(translation.title, news.title),
    summary: pick(translation.summary, news.summary),
    content: pick(translation.content, news.content),
    isStale: isBefore(translation.updatedAt, news.contentUpdatedAt),
  };
}

/**
 * L'adresse d'une actualité dans une langue.
 *
 * La VO garde l'adresse nue : c'est elle qui existait avant les traductions, et
 * les liens déjà partagés doivent continuer de mener quelque part.
 */
export function newsPath(newsId: string, lang: Locale, originalLang: Locale): string {
  return lang === originalLang ? `/news/${newsId}` : `/news/${newsId}/${lang}`;
}

/** Vraie pour une chaîne d'URL qui désigne une langue de l'application. */
export function parseLocale(value: string): Locale | undefined {
  return (locales as readonly string[]).includes(value) ? (value as Locale) : undefined;
}
