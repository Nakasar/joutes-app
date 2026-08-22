import { cn } from "@/lib/utils.ts";

/**
 * La pastille « en direct ».
 *
 * Rouge, et pas de la couleur de la maison : un direct est un état, pas une
 * marque. C'est aussi la seule couleur de la page qui ne se dérive de rien —
 * les groupes et les lieux ont fait le même choix pour la même raison, un
 * direct devant se reconnaître d'une vitrine à l'autre.
 *
 * Le point pulse lentement, à peu près à deux secondes. C'est la seule
 * animation de la page.
 */
export function LiveBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.1em] text-red-600 uppercase dark:text-red-300",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse [animation-duration:2s]"
      />
      {label}
    </span>
  );
}
