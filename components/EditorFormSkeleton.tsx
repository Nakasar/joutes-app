/**
 * Silhouette d'un éditeur — rédaction, modification, traduction.
 *
 * Six écrans partagent la même forme : quelques champs courts, une grande zone
 * de texte, une barre d'actions. Ils partagent donc la même silhouette.
 *
 * Ces pages sont derrière une porte : la session décide de laisser entrer, de
 * renvoyer vers la connexion, ou vers le contenu. Ce qui reste devant la porte
 * est volontairement muet — un bouton de retour et un titre déjà présent dans
 * l'onglet — et la silhouette ne dit rien de ce qu'on va éditer.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */
export function EditorFormSkeleton({
  fields = 3,
  label = "Chargement du formulaire",
}: {
  fields?: number;
  /**
   * Ce que la synthèse vocale annonce. Une silhouette composée passe son propre
   * intitulé plutôt que d'ajouter une seconde région autour de celle-ci : deux
   * régions imbriquées annonceraient deux fois.
   */
  label?: string;
}) {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 w-32 rounded bg-muted/60" />
          <div className="h-10 rounded-md bg-muted" />
        </div>
      ))}

      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-muted/60" />
        <div className="h-72 rounded-md bg-muted" />
      </div>

      <div className="flex justify-end gap-3">
        <div className="h-10 w-28 rounded-md bg-muted/60" />
        <div className="h-10 w-36 rounded-md bg-muted" />
      </div>
    </div>
  );
}
