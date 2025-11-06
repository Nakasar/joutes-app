import { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation - Joutes",
  description: "Conditions générales d'utilisation de la plateforme Joutes.",
};

export default function CGUPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Conditions Générales d&apos;Utilisation</h1>
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : 6 novembre 2025
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Objet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») régissent 
              l&apos;utilisation de la plateforme Joutes (ci-après « la Plateforme »), accessible 
              à l&apos;adresse <a href="https://joutes.app" className="text-primary hover:underline">https://joutes.app</a>.
            </p>
            <p>
              La Plateforme est un service permettant aux utilisateurs de découvrir, organiser et 
              participer à des événements liés aux jeux de cartes à collectionner et aux jeux de société.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Acceptation des CGU</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              L&apos;utilisation de la Plateforme implique l&apos;acceptation pleine et entière des 
              présentes CGU. Si vous n&apos;acceptez pas ces conditions, vous ne devez pas utiliser 
              la Plateforme.
            </p>
            <p>
              Nous nous réservons le droit de modifier ces CGU à tout moment. Les modifications 
              prendront effet dès leur publication sur la Plateforme. Il est de votre responsabilité 
              de consulter régulièrement les CGU.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Inscription et Compte Utilisateur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Pour accéder à certaines fonctionnalités de la Plateforme, vous devez créer un compte 
              utilisateur. Vous vous engagez à :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fournir des informations exactes et à jour</li>
              <li>Être responsable de toutes les activités effectuées depuis votre compte</li>
              <li>Notifier immédiatement toute utilisation non autorisée de votre compte</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Utilisation de la Plateforme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Vous vous engagez à utiliser la Plateforme de manière responsable et à :</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Ne pas publier de contenu illégal, offensant, diffamatoire ou inapproprié</li>
              <li>Respecter les droits de propriété intellectuelle d&apos;autrui</li>
              <li>Ne pas perturber le fonctionnement de la Plateforme</li>
              <li>Ne pas utiliser la Plateforme à des fins commerciales non autorisées</li>
              <li>Respecter les autres utilisateurs et maintenir un comportement courtois</li>
              <li>Ne pas tenter d&apos;accéder à des parties non autorisées de la Plateforme</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Contenu Utilisateur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Vous conservez la propriété du contenu que vous publiez sur la Plateforme (événements, 
              commentaires, etc.). Cependant, en publiant du contenu, vous nous accordez une licence 
              non exclusive, mondiale et gratuite pour utiliser, reproduire, modifier et distribuer 
              ce contenu dans le cadre du fonctionnement de la Plateforme.
            </p>
            <p>
              Vous êtes seul responsable du contenu que vous publiez. Nous nous réservons le droit 
              de modérer, modifier ou supprimer tout contenu qui violerait les présentes CGU.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Données Personnelles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              La collecte et le traitement de vos données personnelles sont effectués dans le respect 
              du Règlement Général sur la Protection des Données (RGPD) et des lois applicables en 
              matière de protection des données.
            </p>
            <p>
              Les données collectées incluent :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Informations de compte (nom d&apos;utilisateur, email)</li>
              <li>Données de localisation (si vous l&apos;autorisez)</li>
              <li>Informations sur vos participations aux événements</li>
              <li>Cookies et données de navigation</li>
            </ul>
            <p>
              Vous disposez d&apos;un droit d&apos;accès, de rectification et de suppression de vos 
              données personnelles. Pour exercer ces droits, veuillez nous contacter via Discord ou GitHub.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Propriété Intellectuelle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              La Plateforme et son contenu (hors contenu utilisateur) sont protégés par les droits 
              de propriété intellectuelle.
            </p>
            <p>
              Les noms, logos et marques des jeux mentionnés sur la Plateforme appartiennent à 
              leurs propriétaires respectifs. Joutes n&apos;est pas affilié à ces éditeurs de jeux.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Limitation de Responsabilité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              La Plateforme est fournie « en l&apos;état » sans garantie d&apos;aucune sorte. Nous 
              nous efforçons de maintenir la Plateforme accessible et fonctionnelle, mais ne pouvons 
              garantir une disponibilité ininterrompue.
            </p>
            <p>
              Nous ne sommes pas responsables :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Des interactions entre utilisateurs</li>
              <li>De la véracité des informations publiées par les utilisateurs</li>
              <li>Des dommages résultant de l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser la Plateforme</li>
              <li>Des événements organisés par les utilisateurs ou les boutiques</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9. Résiliation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Vous pouvez supprimer votre compte à tout moment. Nous nous réservons le droit de 
              suspendre ou de supprimer votre compte en cas de violation des présentes CGU, sans 
              préavis ni indemnité.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Droit Applicable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Les présentes CGU sont régies par le droit français. En cas de litige, les tribunaux 
              français seront seuls compétents.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11. Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Pour toute question concernant ces CGU, vous pouvez nous contacter via :
            </p>
            <ul className="space-y-2">
              <li>
                <strong>Discord :</strong>{" "}
                <a 
                  href="https://discord.gg/dZEGkZwJGB" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://discord.gg/dZEGkZwJGB
                </a>
              </li>
              <li>
                <strong>GitHub :</strong>{" "}
                <a 
                  href="https://github.com/Joutes" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://github.com/Joutes
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
