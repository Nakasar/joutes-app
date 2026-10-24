import { cn } from "@/lib/utils";

type EventBannerProps = {
  /** La bannière de l'événement, sinon celle de son jeu. */
  src?: string | null;
  alt: string;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Le bandeau d'un événement, en 3:1 sur la page comme dans le formulaire.
 *
 * Sans image — ni celle de l'événement, ni celle du jeu —, un fond neutre aux
 * couleurs du thème garde la mise en page : le calendrier et le titre qui
 * chevauchent le bandeau ne changent pas de place d'un événement à l'autre.
 */
export function EventBanner({ src, alt, className, children }: EventBannerProps) {
  return (
    <div
      className={cn(
        "relative aspect-[3/1] w-full overflow-hidden rounded-2xl border bg-muted",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- la bannière d'un jeu peut venir d'un hôte que next/image ne déclare pas
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,color-mix(in_oklab,var(--primary)_35%,transparent),transparent_60%)]"
        />
      )}
      {children}
    </div>
  );
}
