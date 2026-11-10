import { Gamepad2 } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Les petites pièces des vues de jeu du groupe (Tournois, Méta) : l'icône
 * d'un jeu, la vignette d'une légende, une pastille de filtre, l'avatar d'un
 * membre.
 */

export type GameInfo = { name: string; icon?: string };

/** L'icône d'un jeu, ou une manette quand le jeu n'en a pas. */
export function GameIcon({ game, size }: { game?: GameInfo; size: "sm" | "lg" }) {
  const box = size === "lg" ? "size-10 rounded-lg" : "size-5 rounded";
  if (game?.icon) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden", box, size === "lg" && "border bg-background/60 p-1")}>
        {/* L'icône d'un jeu vient de la base : hôte non déclaré. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={game.icon} alt={size === "lg" ? game.name : ""} title={game.name} className="size-full object-contain" />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-muted", box)} title={game?.name}>
      <Gamepad2 className={cn("text-muted-foreground", size === "lg" ? "size-5" : "size-3")} aria-hidden />
    </span>
  );
}

export function LegendThumb({ image }: { image?: string }) {
  if (!image) {
    return <span aria-hidden className="inline-block h-7 w-5 shrink-0 rounded-[3px] border bg-muted" />;
  }

  return (
    <span className="inline-block h-7 w-5 shrink-0 overflow-hidden rounded-[3px] border">
      {/* Les images de cartes viennent de plusieurs hôtes : `next/image` les refuserait. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="size-full object-cover object-top" loading="lazy" />
    </span>
  );
}

export function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-[13px] text-[13px] transition-colors",
        active ? "border-[var(--group-accent)] bg-[var(--group-accent-14)] text-[var(--group-accent-text)]" : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

export function MemberDot({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) {
    return (
      <span className="size-6 shrink-0 overflow-hidden rounded-full">
        {/* `next/image` refuserait l'hôte : les avatars viennent de fournisseurs externes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--group-accent-16)] text-[10px] font-bold text-[var(--group-accent-text)]"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
