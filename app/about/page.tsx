import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, Users, MapPin, Calendar, Heart } from "lucide-react";

export const metadata: Metadata = {
  title: "À propos - Joutes",
  description: "Découvrez Joutes, la plateforme qui connecte les passionnés de jeux de cartes à collectionner et de jeux de société avec leur communauté locale.",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-8">
        {/* En-tête */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">À propos de Joutes</h1>
          <p className="text-xl text-muted-foreground">
            La plateforme qui connecte les joueurs passionnés avec leur communauté locale
          </p>
        </div>

        {/* Mission */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5" />
              Notre Mission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Joutes est né de la passion pour les jeux de cartes à collectionner et les jeux de société. 
              Notre mission est de faciliter la découverte et la participation aux événements organisés 
              près de chez vous, tout en vous connectant avec votre communauté locale de joueurs.
            </p>
            <p>
              Que vous soyez un joueur occasionnel ou un compétiteur aguerri, Joutes vous aide à 
              trouver des parties, des tournois et des événements qui correspondent à vos passions 
              et à votre niveau.
            </p>
          </CardContent>
        </Card>

        {/* Fonctionnalités */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Événements et Matchs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Découvrez et participez à des événements organisés, des tournois et des rencontres 
                amicales. Organisez vos propres parties et invitez d&apos;autres joueurs à vous rejoindre.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Recherche Géolocalisée
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Trouvez des événements et des boutiques de jeux près de chez vous grâce à notre 
                système de recherche par localisation. Ne manquez plus jamais un événement local !
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Swords className="w-5 h-5" />
                Multi-jeux
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Support pour une large variété de jeux de cartes à collectionner (TCG) et de jeux 
                de société. Magic: The Gathering, Pokémon, Yu-Gi-Oh!, et bien d&apos;autres !
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Communauté
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Suivez vos boutiques de jeux préférées, connectez-vous avec d&apos;autres joueurs, 
                et restez informé des derniers événements de votre communauté locale.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Valeurs */}
        <Card>
          <CardHeader>
            <CardTitle>Nos Valeurs</CardTitle>
            <CardDescription>Ce qui guide notre développement</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Communauté d&apos;abord :</strong> Nous construisons des outils pour et avec 
                  la communauté des joueurs.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Accessibilité :</strong> Nous nous efforçons de rendre la plateforme 
                  accessible à tous, quel que soit le niveau d&apos;expérience.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Local d&apos;abord :</strong> Nous croyons au pouvoir des communautés locales 
                  et des boutiques de jeux indépendantes.
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Rejoignez-nous</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Joutes est en constante évolution grâce aux retours de notre communauté. 
              N&apos;hésitez pas à nous faire part de vos suggestions, signaler des bugs ou 
              contribuer au projet !
            </p>
            <div className="flex flex-wrap gap-4">
              <a 
                href="https://discord.gg/dZEGkZwJGB" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Rejoignez notre Discord →
              </a>
              <a 
                href="https://github.com/Joutes" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Contribuez sur GitHub →
              </a>
              <a 
                href="https://x.com/JoutesApp" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Suivez-nous sur X →
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
