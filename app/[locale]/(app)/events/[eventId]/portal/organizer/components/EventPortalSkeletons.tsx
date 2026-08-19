import type { ReactNode } from "react";

/**
 * Silhouettes des sections du portail d'événement.
 *
 * Le cadre — titre de l'événement, pilotage de l'état, barre d'onglets et
 * avertissement de configuration — vient du `layout` et reste monté d'une
 * section à l'autre. Ces silhouettes ne couvrent que la zone de contenu, celle
 * qui se rafraîchit.
 *
 * Les sections sont bâties sur la `Card` de l'interface : en-tête de 44 px
 * (titre et phrase d'explication) puis corps en `px-6`. Les silhouettes
 * reprennent ces classes plutôt qu'une approximation, pour que le remplacement
 * ne décale rien.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-pulse flex-col gap-6 rounded-xl border bg-card py-6" aria-hidden>
      <div className="grid auto-rows-min gap-1.5 px-6">
        <div className="h-[22px] w-56 rounded bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted/60" />
      </div>
      <div className="px-6">{children}</div>
    </div>
  );
}

/**
 * Section en liste : un décompte, des lignes de 56 px, puis l'action en pied.
 * Les hauteurs sont relevées sur l'écran des participants.
 */
export function EventSectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SectionCard>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded bg-muted" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-[56px] rounded-lg border" />
          ))}
        </div>
        <div className="h-9 w-48 rounded-lg border" />
      </div>
    </SectionCard>
  );
}

/** Section en tableau : une rangée d'intitulés puis des lignes serrées. */
export function EventTableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <SectionCard>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex h-10 items-center gap-4 border-b bg-muted/50 px-4">
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="h-2.5 flex-1 rounded bg-muted" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-4 border-b px-4 last:border-b-0">
            {Array.from({ length: columns }, (_, c) => (
              <div key={c} className="h-3 flex-1 rounded bg-muted/60" />
            ))}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/** Arbre d'élimination : un grand bloc, la forme ne se devine pas à l'avance. */
export function EventBracketSkeleton() {
  return (
    <SectionCard>
      <div className="h-[320px] rounded-lg border" />
    </SectionCard>
  );
}

/** Section en formulaire : des champs empilés puis un bouton d'enregistrement. */
export function EventFormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SectionCard>
      <div className="space-y-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-9 rounded-lg border" />
          </div>
        ))}
        <div className="h-9 w-32 rounded bg-muted" />
      </div>
    </SectionCard>
  );
}
