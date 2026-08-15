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

export type News = {
  id: string;
  title: string;
  summary: string;
  content: string;
  banner?: string;
  source?: NewsSource;
  gameIds: string[];
  games?: Array<{ id: string; name: string; icon?: string; slug?: string }>;
  tags: string[];
  authorId: string;
  author?: { id: string; displayName?: string; discriminator?: string };
  likedBy: string[];
  likesCount: number;
  userHasLiked?: boolean;
  createdAt: Date;
  updatedAt: Date;
};
