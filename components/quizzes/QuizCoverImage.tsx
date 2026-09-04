import { cn } from "@/lib/utils.ts";
import { quizCoverPosition, type QuizCover } from "@/lib/quizzes/cover.ts";

/**
 * L'illustration d'un quizz, partout où le quizz se montre.
 *
 * Un seul composant pour la vignette d'une liste et le bandeau d'une fiche : le
 * cadrage suit la provenance — une illustration de carte porte son sujet en
 * haut, une image déposée a été choisie pour son centre —, si bien qu'une même
 * couverture ne peut pas se présenter autrement d'un écran à l'autre.
 *
 * Rien quand il n'y a rien : un quizz sans couverture garde sa carte telle
 * qu'elle était, plutôt que de gagner un aplat vide. C'est ce qui permet à la
 * couverture de rester facultative sans dépareiller une grille.
 *
 * Une balise `img` nue : l'illustration peut venir du catalogue de cartes du
 * jeu, dont l'hôte n'est pas déclaré dans `next.config.ts` et que le composant
 * image de Next refuserait donc.
 */
export function QuizCoverImage({
  cover,
  title,
  className,
}: {
  cover: QuizCover;
  /** Titre du quizz : l'infobulle de la vignette. L'image, elle, est décorative. */
  title?: string;
  className?: string;
}) {
  if (!cover.image) {
    return null;
  }

  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.image}
        alt=""
        title={title}
        loading="lazy"
        className={cn(
          "size-full object-cover",
          quizCoverPosition(cover.source) === "top" ? "object-top" : "object-center",
        )}
      />
    </span>
  );
}
