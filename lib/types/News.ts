import type { UserBadges } from "@/lib/db/user-badges";
import { Locale } from "@/i18n/config";

/**
 * D'où vient une actualité reprise d'ailleurs — le site officiel d'un jeu, le
 * plus souvent. Portée par l'actualité elle-même plutôt que déduite d'un lien
 * glissé dans le corps : c'est une attribution, elle doit s'afficher et rester
 * exacte même si le texte est réécrit.
 */
export type NewsSource = {
  /** Le site, tel qu'il se nomme (« Riftbound », « playriftbound.com »). */
  name: string;
  /** L'adresse de l'article d'origine. */
  url: string;
};

/**
 * Une actualité dans une autre langue que celle où elle a été écrite.
 *
 * Les trois textes lus par un visiteur sont traduisibles — le titre et le
 * résumé apparaissent dans la liste et dans les aperçus de partage, où laisser
 * la version originale trahirait la traduction dès le premier coup d'œil.
 * Bannière, jeux, tags et source n'en sont pas : ils ne changent pas d'une
 * langue à l'autre.
 */
export type NewsTranslationInput = {
  lang: Locale;
  title: string;
  summary: string;
  content: string;
};

export type NewsTranslation = NewsTranslationInput & {
  /** Quand cette langue a été saisie pour la dernière fois. */
  updatedAt: Date;
};

export type News = {
  id: string;
  title: string;
  summary: string;
  content: string;
  /** La langue dans laquelle l'actualité a été écrite : sa VO. */
  originalLang: Locale;
  /**
   * Dernière modification des *textes* de la VO, distincte d'`updatedAt` que
   * bouge n'importe quelle retouche (tags, bannière, traduction). C'est elle
   * qui dit qu'une traduction a pris du retard.
   */
  contentUpdatedAt: Date;
  translations?: NewsTranslation[];
  banner?: string;
  source?: NewsSource;
  gameIds: string[];
  games?: Array<{ id: string; name: string; icon?: string; slug?: string }>;
  tags: string[];
  authorId: string;
  author?: {
    id: string;
    displayName?: string;
    discriminator?: string;
    /** Palier et statuts, résolus en lot par `lib/db/news.ts`. */
    badges?: UserBadges;
  };
  likedBy: string[];
  likesCount: number;
  userHasLiked?: boolean;
  createdAt: Date;
  updatedAt: Date;
};
