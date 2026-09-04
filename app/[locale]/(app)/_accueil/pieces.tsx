import type { ReactNode } from "react";
import { Layers, Newspaper, Play, Radio } from "lucide-react";

import { cn } from "@/lib/utils.ts";
import { externalUrl } from "@/lib/lairs/urls.ts";
import type { TypeContenu } from "./accueil-data.ts";

/**
 * Le vocabulaire de l'accueil.
 *
 * La page reprend la composition d'un tableau d'affichage — des fiches
 * punaisées qui se chevauchent — mais avec les matériaux de la maison : les
 * jetons de `globals.css`, une seule police, les rayons de `--radius`.
 *
 * Deux règles gouvernent tout ce qui suit, et elles sont volontairement
 * étroites :
 *
 *  1. LE PAPIER PENCHE, LES COMMANDES NON. Ce qui répond au doigt — bouton,
 *     onglet, lien — reste droit. Sans cette frontière, la page devient un
 *     décor où l'on ne sait plus quoi cliquer.
 *  2. L'INCLINAISON DÉPEND DE LA LARGEUR. Une fiche d'agenda va de un à deux
 *     degrés et demi ; une bande large ne dépasse pas le demi-degré, au-delà
 *     duquel elle ne penche plus, elle paraît mal alignée.
 */

/** Une fiche : le geste de base de la page. */
export function Fiche({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-xl border bg-card shadow-sm", className)}>{children}</div>
  );
}

/**
 * La punaise.
 *
 * Rouge pour une échéance — c'est ce qui tient l'agenda — et neutre pour un
 * contenu du fil. Elle est décorative : ce qu'elle signifie est déjà écrit à
 * côté, d'où l'`aria-hidden`.
 */
export function Punaise({
  ton = "echeance",
  className,
}: {
  ton?: "echeance" | "contenu";
  className?: string;
}) {
  const tete = ton === "echeance" ? "fill-destructive" : "fill-card stroke-border";

  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className={cn("absolute -top-2.5 size-[22px]", className)}
    >
      <ellipse cx="11" cy="18" rx="5" ry="1.6" className="fill-foreground/20" />
      <circle cx="11" cy="9" r="7.5" className={tete} />
      <circle cx="8.6" cy="6.6" r="2.4" className="fill-white/35" />
      <path d="M11 16.5v1.6" strokeWidth="1.4" strokeLinecap="round" className="stroke-foreground/40" />
    </svg>
  );
}

/**
 * Le fanion de la prochaine échéance.
 *
 * C'est le seul repère qui hiérarchise l'agenda : sans lui, trois dates se
 * valent. Il ne se pose donc que sur une fiche à la fois.
 */
export function Fanion({ children }: { children: ReactNode }) {
  return (
    <span className="bg-destructive text-white absolute top-3 right-3 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase">
      {children}
    </span>
  );
}

/** Le titre d'une section, et ce qui la prolonge à droite. */
export function EtiquetteSection({
  icone,
  children,
  action,
}: {
  icone: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        {icone}
        {children}
      </h2>
      {action}
    </div>
  );
}

const ICONES_TIRAGE = {
  actu: Newspaper,
  video: Play,
  deck: Layers,
  direct: Radio,
} as const;

/**
 * La place d'une image.
 *
 * Quand le contenu en a une, elle s'affiche. Sinon on DESSINE la place plutôt
 * que d'en inventer une : un aplat hachuré et l'icône du genre. Les decks, qui
 * n'ont pas d'illustration, tombent toujours dans ce cas.
 */
export function Tirage({
  src,
  type,
  duree,
  className,
}: {
  src?: string;
  type: TypeContenu | "direct";
  duree?: string;
  className?: string;
}) {
  const Icone = ICONES_TIRAGE[type];

  /*
   * Filtré ici, et non à la source : les vignettes du fil viennent de deux
   * collections aux garanties inégales. `UserContent.thumbnail` passe déjà par
   * `externalUrl` à la saisie, mais `News.banner` se contente d'un
   * `z.string().url()`, qui accepte n'importe quel schéma. C'est en devenant un
   * `src` que la question se pose : on y répond donc ici, une fois pour les
   * deux. Ce qui n'est pas http(s) retombe sur l'icône.
   */
  const vignette = externalUrl(src);

  return (
    <span
      className={cn(
        "bg-muted relative shrink-0 overflow-hidden rounded-lg border",
        className,
      )}
    >
      {vignette ? (
        /*
         * Une balise ordinaire, et non `next/image` : la miniature d'un
         * contenu est une URL que son auteur saisit — YouTube, un blog, ce
         * qu'il veut. L'optimiseur n'accepte que les hôtes déclarés dans
         * `next.config.ts`, et refuserait tout le reste à l'exécution.
         * `LairHero` a fait le même choix pour la bannière d'un lieu.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vignette}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-border)_0_1px,transparent_1px_8px)]"
        >
          <Icone className="text-muted-foreground/50 size-6" />
        </span>
      )}
      {duree && (
        <span className="bg-foreground text-background absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
          {duree}
        </span>
      )}
    </span>
  );
}

/**
 * Les inclinaisons et le recouvrement des trois annonces de l'agenda.
 *
 * Sur un vrai panneau, la dernière fiche punaisée recouvre les précédentes.
 * Ici l'ordre est inversé — c'est la PROCHAINE échéance qui passe devant,
 * parce que c'est elle qu'on doit voir en premier. L'empilement est une
 * hiérarchie, pas une décoration.
 */
export const POSES_ANNONCE = [
  "z-30 rotate-[-2.1deg] sm:-mr-4",
  "z-20 rotate-[1.3deg] sm:mt-4 sm:-mr-4",
  "z-10 rotate-[-1deg] sm:mt-[7px]",
] as const;

/** Les coupures du fil : à peine de travers, et jamais deux fois du même côté. */
export function poseCoupure(index: number): string {
  return index % 2 === 0 ? "rotate-[-0.5deg]" : "rotate-[0.55deg]";
}
