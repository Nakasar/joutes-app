/**
 * Silhouette du pied de page, affichée le temps que le vrai pied arrive.
 *
 * Le pied contient des liens localisés, et `Link` lit le chemin courant à chaque
 * rendu — inconnu au prérendu d'une route à segment dynamique. Il attend donc
 * derrière une frontière, comme le `Header` et `WebMcpTools`, et c'est cette
 * silhouette qui part dans la coquille statique à sa place.
 *
 * Elle reprend le cadre, les rangées et l'espacement de l'original, pour que
 * rien ne saute au remplacement. Aucun `Link` ici : il rappellerait le chemin
 * courant et rebloquerait ce que la frontière vient de débloquer.
 *
 * Sur une route statique, le chemin est connu au prérendu : le vrai pied ne
 * suspend pas et cette silhouette ne s'affiche jamais.
 */
export default function FooterFallback() {
  return (
    <footer data-print-hidden className="border-t py-8 mt-auto bg-muted/30" aria-hidden>
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-wrap justify-center gap-4 items-center">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-5 w-20 rounded bg-muted" />
            ))}
          </div>

          <div>
            <div className="h-9 w-9 rounded bg-muted" />
          </div>

          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {[64, 96, 64, 40, 96, 96, 88].map((width, i) => (
              <div key={i} className="h-5 rounded bg-muted" style={{ width }} />
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="h-5 w-72 max-w-full rounded bg-muted" />
        </div>
      </div>
    </footer>
  );
}
