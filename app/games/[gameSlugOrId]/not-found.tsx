import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search } from "lucide-react";

export default function GameNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center">
      <div className="text-center px-4 space-y-6 max-w-2xl">
        <div className="text-9xl font-bold text-white/10 animate-pulse">404</div>

        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          Jeu non trouvé
        </h1>

        <p className="text-xl text-gray-400 mb-8">
          Le jeu que vous recherchez n'existe pas ou a été supprimé.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link href="/games">
            <Button size="lg" variant="secondary" className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20">
              <Search className="h-5 w-5 mr-2" />
              Parcourir tous les jeux
            </Button>
          </Link>

          <Link href="/">
            <Button size="lg" className="bg-white text-black hover:bg-gray-200">
              <ArrowLeft className="h-5 w-5 mr-2" />
              Retour à l'accueil
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

