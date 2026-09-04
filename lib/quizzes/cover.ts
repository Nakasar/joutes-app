import { isAppBlobImageUrl } from "@/lib/media/blob-image-url";

/**
 * D'où vient l'illustration d'un quizz.
 *
 * Deux choix explicites et un vide : une image déposée par l'auteur, une carte
 * du jeu qu'il a désignée, ou rien — le quizz s'affiche alors sans bandeau.
 * Contrairement à un deck, un quizz n'a pas de carte qui le désigne d'office :
 * il n'y a pas de repli à tenter.
 */
export type QuizCoverSource = "upload" | "card" | "none";

/** Ce qu'un quizz porte de sa couverture, et rien d'autre. */
export type QuizCoverFields = {
  /** Image déposée par l'auteur. Prime sur la carte désignée. */
  coverImageUrl?: string;
  /** Carte du jeu choisie pour illustrer le quizz. */
  coverCardId?: string;
  /** Adresse effectivement affichée — dérivée, écrite à l'enregistrement. */
  coverImage?: string;
};

export type QuizCover = {
  source: QuizCoverSource;
  image?: string;
  /** La carte désignée, quand la couverture en est une. */
  cardId?: string;
};

/**
 * La couverture d'un quizz, telle qu'un écran doit l'afficher.
 *
 * `cardImage` est **facultative** : l'éditeur a sous la main l'illustration de
 * la carte qu'on vient de choisir et montre donc l'aperçu avant tout
 * enregistrement, une liste ne l'a pas et lit la valeur dénormalisée
 * `coverImage`. Les deux passent par ici pour que la vignette d'une liste et le
 * bandeau d'une fiche ne puissent pas montrer deux images du même quizz.
 *
 * L'ordre est celui de l'intention : ce que l'auteur a déposé prime sur ce
 * qu'il a désigné — c'est le geste le plus explicite des deux.
 */
export function resolveQuizCover(quiz: QuizCoverFields, cardImage?: string): QuizCover {
  if (quiz.coverImageUrl) {
    return { source: "upload", image: quiz.coverImageUrl };
  }

  if (quiz.coverCardId) {
    return { source: "card", cardId: quiz.coverCardId, image: cardImage ?? quiz.coverImage };
  }

  return { source: "none", image: undefined };
}

/**
 * Le cadrage d'une couverture.
 *
 * Une illustration de carte porte son sujet en haut — la cadrer au centre
 * décapite le personnage dans un bandeau panoramique. Une image déposée, elle,
 * a été choisie pour ce qu'elle montre : c'est son centre qui compte.
 */
export function quizCoverPosition(source: QuizCoverSource): "top" | "center" {
  return source === "upload" ? "center" : "top";
}

/**
 * Une adresse d'image de couverture acceptable.
 *
 * La règle est celle de toutes les images déposées sur Joutes
 * (`isAppBlobImageUrl`) : seul son propre stockage est admis. L'auteur dépose
 * son image par `POST /api/quizzes/cover`, qui rend l'adresse à inscrire
 * ensuite sur le quizz.
 */
export function isQuizCoverImageUrl(value: string): boolean {
  return isAppBlobImageUrl(value);
}
