import { cn } from "@/lib/utils.ts";

/**
 * L'écu d'un groupe : ses initiales sur son accent, cerné d'un filet d'or.
 *
 * Le blason plutôt que l'emblème téléversé, et pour une raison de fond : tous
 * les groupes n'ont pas d'emblème, et une grille où une ligne sur deux montre
 * un carré vide ne ressemble à rien. L'écu, lui, existe toujours — deux
 * lettres et une couleur suffisent à le dessiner.
 *
 * Quand le groupe a téléversé un emblème, il vient le remplir : c'est alors sa
 * vraie image, découpée à la forme de l'écu.
 */
export default function Escu({
  initials,
  logo,
  live,
  liveLabel,
  size = "md",
  className,
}: {
  initials: string;
  logo?: string | null;
  /** L'oriflamme rouge en travers de l'écu, quand le groupe diffuse. */
  live?: boolean;
  liveLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { box: "h-[26px] w-[22px]", text: "text-[8px]" },
    md: { box: "h-[66px] w-[56px]", text: "text-base" },
    lg: { box: "h-[92px] w-[78px]", text: "text-[23px]" },
  }[size];

  return (
    <span className={cn("play-group-escu block", sizes.box, className)} aria-hidden>
      <span className="play-group-escu-field overflow-hidden">
        {logo ? (
          // Une balise nue : l'emblème peut encore être une adresse tierce,
          // héritée d'avant le téléversement, que `next/image` refuserait.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <b
            className={cn(
              "font-[family-name:var(--font-cinzel)] font-bold tracking-[.04em] text-black/80",
              sizes.text,
            )}
          >
            {initials}
          </b>
        )}
      </span>

      {live && (
        <span className="play-group-escu-live bg-red-500 py-[3px] text-center font-mono text-[9px] leading-none font-medium tracking-[.16em] text-white uppercase">
          {liveLabel}
        </span>
      )}
    </span>
  );
}
