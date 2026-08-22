"use client";

import { cn } from "@/lib/utils.ts";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Explication affichée en infobulle — c'est là que passe le sens d'un état de visibilité. */
  hint?: string;
  icon?: React.ReactNode;
};

/**
 * Groupe segmenté : deux à trois états dont un seul est actif.
 *
 * Préféré à une liste déroulante partout où les options sont peu nombreuses et
 * méritent d'être lues d'un coup — visibilité du deck, visuel/texte,
 * grille/liste. Rendu en `radiogroup` : les flèches du clavier y circulent, ce
 * qu'une rangée de boutons ne donne pas.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "default",
  label,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "default";
  /** Intitulé du groupe pour les lecteurs d'écran. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border p-0.5",
        size === "sm" ? "h-9" : "h-10",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
