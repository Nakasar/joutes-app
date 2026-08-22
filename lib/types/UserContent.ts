/**
 * Un contenu publié par un joueur.
 *
 * Même grammaire que les contenus d'un groupe de jeu
 * (`PlayGroupContentItem`) : un article porte son corps en markdown, une vidéo
 * et un replay portent une URL. Les trois partagent la même carte, d'où le type
 * unique.
 *
 * **Collection de tête, et non sous-document du compte.** Il faut pouvoir
 * l'interroger par auteur — la vitrine du profil — *et* par « auteurs membres
 * du groupe X » — la vitrine d'un groupe, où le contenu public de ses membres
 * remonte à côté de celui du groupe. Un tableau dans le document `user` ne
 * répondrait qu'à la première question.
 */

export const USER_CONTENT_KINDS = ["video", "article", "replay"] as const;

export type UserContentKind = (typeof USER_CONTENT_KINDS)[number];

/**
 * Qui voit le contenu.
 *
 * `private` est un brouillon autant qu'un secret : il n'apparaît ni sur la
 * vitrine du profil, ni sur celle d'un groupe, et son auteur seul y accède.
 */
export type UserContentVisibility = "public" | "private";

export type UserContent = {
  id: string;
  authorId: string;
  kind: UserContentKind;
  visibility: UserContentVisibility;
  title: string;
  summary?: string;
  /** Markdown — les articles seulement. */
  body?: string;
  /** URL de la vidéo ou du replay. */
  url?: string;
  thumbnail?: string;
  /** Durée affichée telle quelle — « 12 min », « 1 h 04 ». */
  duration?: string;
  gameId?: string;
  /** ISO 8601. */
  publishedAt: string;
  updatedAt?: string;
};

/** Le nombre de contenus qu'un compte peut publier. */
export const MAX_USER_CONTENTS = 100;
