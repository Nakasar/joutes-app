import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

/**
 * La mise en page commune des écrans de l'administration : une largeur, des
 * marges, et un en-tête titre + phrase d'explication + actions.
 *
 * Chaque page posait jusqu'ici son propre fond, ses marges et sa taille de
 * titre ; elles se ressemblent maintenant d'un écran à l'autre.
 */
export function AdminPage({
  title,
  description,
  actions,
  back,
  width = "default",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Le lien de retour au-dessus du titre, pour une fiche. */
  back?: { href: string; label: string };
  width?: "narrow" | "default" | "wide";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 pt-7 pb-16 sm:px-8",
        width === "narrow" && "max-w-3xl",
        width === "default" && "max-w-6xl",
        width === "wide" && "max-w-7xl"
      )}
    >
      <header className="flex flex-col gap-2">
        {back && (
          <Link href={back.href} className="w-fit text-sm text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description && <div className="text-[15px] text-muted-foreground">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}

/** Une carte blanche aux bords arrondis, le conteneur de base des écrans. */
export function AdminPanel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-border bg-card", className)}>{children}</section>;
}
