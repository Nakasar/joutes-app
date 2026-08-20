import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft, Search } from "lucide-react";

/**
 * L'écran d'absence des routes de jeu.
 *
 * Next prépare cette limite dans la coquille de **chaque** route du sous-arbre :
 * ce fichier fait partie du prérendu des onze pages de jeu, même quand aucune
 * n'échoue. Ce qu'il contient les concerne donc toutes.
 *
 * D'où les `<a>` plutôt que le `Link` localisé. Le `Link` lit le chemin courant,
 * inconnu au prérendu d'une route à segment dynamique : il suspendait la
 * coquille des onze pages, qui se réduisaient au seul cadre de l'application.
 * Mesuré sur la galerie de cartes : **4 321 octets avec le `Link`, 18 522 avec
 * ses silhouettes sans lui**.
 *
 * Une frontière `<Suspense>` autour des boutons ne suffit pas — vérifié : Next
 * prérend ce fichier hors du contexte de la page, et la frontière n'y arrête
 * rien. Il faut que le `Link` disparaisse.
 *
 * Ce que coûtent les `<a>` : une navigation complète au lieu d'une navigation
 * client, et un aller-retour par le proxy pour retrouver la langue — que le
 * cookie porte, donc un visiteur anglophone arrive bien sur `/en/games`. Sur un
 * écran d'erreur qu'on quitte aussitôt, c'est sans conséquence.
 */
export default function GameNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center">
      <div className="text-center px-4 space-y-6 max-w-2xl">
        <div className="text-9xl font-bold text-white/10 animate-pulse">404</div>

        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          Jeu non trouvé
        </h1>

        <p className="text-xl text-gray-400 mb-8">
          Le jeu que vous recherchez n&apos;existe pas ou a été supprimé.
        </p>

        {/* `asChild` pour que le bouton *soit* le lien. Enveloppé, il rendait un
            `<button>` dans un `<a>` — contenu interactif imbriqué, invalide en
            HTML et confus au clavier comme à la synthèse vocale. Le défaut
            existait déjà avec le `Link`. */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button asChild size="lg" variant="secondary" className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20">
            <a href="/games">
              <Search className="h-5 w-5 mr-2" />
              Parcourir tous les jeux
            </a>
          </Button>

          <Button asChild size="lg" className="bg-white text-black hover:bg-gray-200">
            <a href="/">
              <ArrowLeft className="h-5 w-5 mr-2" />
              Retour à l&apos;accueil
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
