import { cn } from "@/lib/utils";
import { isLandscapeCard, type CardOrientation } from "@/lib/types/card";

/** Proportions `largeur/hauteur` d'une vignette de carte, par défaut celles d'une carte à jouer. */
const DEFAULT_FRAME = "63/88";

type Props = {
  src: string;
  alt: string;
  /** Sens d'impression de la carte ; tout ce qui n'est pas `landscape` reste vertical. */
  orientation?: CardOrientation;
  /**
   * Classes de l'élément qui occupe la place dans la mise en page : l'image
   * elle-même en portrait, le cadre qui la contient en paysage.
   */
  className?: string;
  /**
   * Proportions `largeur/hauteur` de la vignette. Elles servent à poser l'image
   * paysage avant de la pivoter, et donnent au cadre sa hauteur quand l'appelant
   * ne lui donne qu'une largeur. À corriger seulement quand la vignette n'est
   * pas au format d'une carte (une tuile de collection en 3/4, par exemple).
   */
  frame?: string;
  /**
   * Infobulle au survol. Utile là où la vignette est seule à représenter la
   * carte, sans son nom à côté (la vue visuelle d'une liste de deck).
   */
  title?: string;
  loading?: "lazy" | "eager";
};

/**
 * Illustration d'une carte, quel que soit son sens d'impression.
 *
 * Les cartes paysage — les champs de bataille de Riftbound — ont une image plus
 * large que haute : posée telle quelle dans une grille de cartes, elle y serait
 * deux fois moins haute que ses voisines, et rognée partout où la vignette
 * impose un format portrait. On la pivote donc d'un quart de tour, comme le
 * fait la galerie officielle : la carte occupe alors la même vignette que les
 * autres, et se lit en penchant la tête — ou l'écran.
 *
 * Le quart de tour est anti-horaire : c'est le sens qui remet le titre et le
 * texte de la carte le long du bord droit de la vignette.
 */
export default function CardImage({
  src,
  alt,
  orientation,
  className,
  frame = DEFAULT_FRAME,
  title,
  loading,
}: Props) {
  if (!isLandscapeCard(orientation)) {
    return <img src={src} alt={alt} title={title} loading={loading} className={className} />;
  }

  const [frameWidth, frameHeight] = frame.split("/").map(Number);

  return (
    <span className={cn("relative block overflow-hidden", className)} style={{ aspectRatio: frame }}>
      {/*
        La boîte de l'image est posée à plat — aussi large que le cadre est
        haut, aussi haute que le cadre est large — puis pivotée : une fois
        tournée, elle recouvre exactement le cadre. `object-cover` absorbe ce
        qui manquerait à une image dont les proportions ne seraient pas tout à
        fait celles d'une carte.
      */}
      <img
        src={src}
        alt={alt}
        title={title}
        loading={loading}
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-90 object-cover"
        style={{
          width: `${(frameHeight / frameWidth) * 100}%`,
          height: `${(frameWidth / frameHeight) * 100}%`,
        }}
      />
    </span>
  );
}
