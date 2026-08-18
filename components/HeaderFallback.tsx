import Image from "next/image";

/**
 * Silhouette de l'en-tête, affichée le temps que le vrai en-tête arrive.
 *
 * L'en-tête est un composant client : ses liens lisent le chemin courant, que
 * le prérendu d'une route à segment dynamique ne connaît pas. Il attend donc
 * derrière une frontière, et c'est cette silhouette qui part dans la coquille
 * statique à sa place.
 *
 * Elle reprend exactement la hauteur, la bordure et le fond de l'original :
 * sans ça, toute la page sauterait au moment du remplacement. Le logo est
 * repris tel quel — c'est ce qui rend l'attente lisible plutôt que vide — mais
 * sans lien : un `Link` localisé rappellerait le chemin courant et rebloquerait
 * ce que cette frontière vient de débloquer.
 */
export default function HeaderFallback() {
  return (
    <header
      data-print-hidden
      className="top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-2xl">
            <Image
              src={`/logo/joutes_logo${process.env.NEXT_PUBLIC_THEME === 'default' ? '' : process.env.NEXT_PUBLIC_THEME}.png`}
              alt=""
              width={120}
              height={120}
              className="rounded-full size-6"
            />
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Joutes
            </span>
          </div>
        </div>
      </nav>
    </header>
  );
}
