import Link from "next/link";
import {
  LEGAL_CONTACT,
  LegalDocumentContent,
  LegalLink,
  LegalList,
} from "@/components/legal/LegalDocument";

export const cguFr: LegalDocumentContent = {
  meta: {
    title: "Conditions Générales d'Utilisation",
    description:
      "Conditions générales d'utilisation de la plateforme Joutes : compte, contenus, événements, échanges, API et responsabilités.",
    keywords: ["cgu", "conditions générales d'utilisation", "mentions légales", "joutes"],
  },
  documentLabel: "Document légal",
  title: "Conditions Générales d'Utilisation",
  description:
    "Les règles qui encadrent l'utilisation de Joutes, de votre compte et des contenus que vous y publiez.",
  lastUpdated: (date) => `Dernière mise à jour : ${date}`,
  crossLinks: (
    <>
      Voir aussi la{" "}
      <Link href="/privacy" className="text-primary hover:underline">
        politique de confidentialité
      </Link>{" "}
      et la page{" "}
      <Link href="/about" className="text-primary hover:underline">
        à propos
      </Link>
      .
    </>
  ),
  highlightTitle: "L'essentiel",
  highlight: (
    <>
      <p>
        Joutes est un service indépendant. Les événements, tournois, échanges et contenus sont
        créés par les utilisateurs, qui en restent responsables.
      </p>
      <p>
        Ce résumé est fourni à titre indicatif : seules les clauses détaillées ci-dessous ont
        valeur contractuelle.
      </p>
    </>
  ),
  summaryTitle: "Sommaire",
  articles: [
    {
      id: "objet",
      title: "Objet et éditeur de la Plateforme",
      content: (
        <>
          <p>
            Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») définissent
            les règles d&apos;accès et d&apos;utilisation de la plateforme Joutes (ci-après « la
            Plateforme »), accessible à l&apos;adresse{" "}
            <a href="https://joutes.app" className="text-primary hover:underline">
              https://joutes.app
            </a>{" "}
            ainsi que de ses services associés (interfaces web, API, serveur MCP et bot Discord).
          </p>
          <p>
            La Plateforme permet aux joueuses et joueurs de jeux de cartes à collectionner et de
            jeux de société de découvrir des événements près de chez eux, d&apos;organiser des
            rencontres et des tournois, de gérer leurs collections et de consulter des contenus
            communautaires (règles, rulings, errata).
          </p>
          <p>
            Joutes est un projet indépendant, édité et publié par Nakasar, et développé en partie
            de manière ouverte (voir la page{" "}
            <Link href="/open-source" className="text-primary hover:underline">
              Open Source
            </Link>
            ). La Plateforme est hébergée par Vercel Inc.
          </p>
          <p>
            L&apos;utilisation des fonctionnalités actuellement proposées ne donne lieu à aucun
            paiement. Des services optionnels payants pourront être proposés à l&apos;avenir :
            leurs caractéristiques, leur prix et leurs conditions de souscription seraient alors
            précisés avant toute souscription.
          </p>
        </>
      ),
    },
    {
      id: "acceptation",
      title: "Acceptation et modification des CGU",
      content: (
        <>
          <p>
            L&apos;utilisation de la Plateforme, avec ou sans compte, implique l&apos;acceptation
            pleine et entière des présentes CGU. Si vous ne les acceptez pas, vous ne devez pas
            utiliser la Plateforme.
          </p>
          <p>
            Ces CGU peuvent être modifiées à tout moment, notamment pour accompagner
            l&apos;évolution des fonctionnalités ou du cadre légal. La version applicable est celle
            publiée sur cette page ; la date de dernière mise à jour figure en haut du document. En
            cas de modification substantielle, une information sera diffusée sur la Plateforme ou
            via les canaux communautaires. Continuer à utiliser la Plateforme après une
            modification vaut acceptation de la nouvelle version.
          </p>
        </>
      ),
    },
    {
      id: "compte",
      title: "Accès à la Plateforme et compte utilisateur",
      content: (
        <>
          <p>
            Une partie des contenus (événements, lieux, règles, cartes) est consultable sans
            compte. Les fonctionnalités personnelles (collection, decks, inscriptions, organisation
            d&apos;événements, échanges) nécessitent la création d&apos;un compte.
          </p>
          <p>La connexion s&apos;effectue au choix :</p>
          <LegalList>
            <li>par code à usage unique envoyé à votre adresse email ;</li>
            <li>via un compte Discord ;</li>
            <li>
              via une clé d&apos;accès (passkey / WebAuthn) enregistrée depuis votre espace
              sécurité.
            </li>
          </LegalList>
          <p>En créant un compte, vous vous engagez à :</p>
          <LegalList>
            <li>fournir des informations exactes et les tenir à jour ;</li>
            <li>
              ne pas usurper l&apos;identité d&apos;une autre personne, d&apos;une boutique ou
              d&apos;un organisateur ;
            </li>
            <li>
              préserver la confidentialité de vos moyens de connexion (adresse email, codes reçus,
              clés d&apos;accès, clés d&apos;API) ;
            </li>
            <li>
              assumer la responsabilité de toutes les actions effectuées depuis votre compte, y
              compris par les applications que vous y avez connectées ;
            </li>
            <li>
              nous signaler sans délai toute utilisation non autorisée ou suspicion de
              compromission.
            </li>
          </LegalList>
          <p>
            La Plateforme est destinée aux personnes âgées d&apos;au moins 15 ans. En dessous de
            cet âge, la création d&apos;un compte requiert l&apos;accord préalable du titulaire de
            l&apos;autorité parentale, qui reste responsable de l&apos;usage qui en est fait.
          </p>
        </>
      ),
    },
    {
      id: "services",
      title: "Services proposés",
      content: (
        <>
          <p>
            La Plateforme réunit plusieurs services, susceptibles d&apos;évoluer, d&apos;être
            complétés ou retirés :
          </p>
          <LegalList>
            <li>
              <strong>Événements et calendrier :</strong> publication, recherche (y compris à
              proximité) et inscription à des événements organisés par des joueurs ou des
              boutiques.
            </li>
            <li>
              <strong>Tournois et ligues :</strong> création et gestion de tournois, appariements,
              saisie de résultats, classements et portails de tournoi.
            </li>
            <li>
              <strong>Lieux et communautés :</strong> pages de lieux (boutiques, clubs, lieux
              privés), suivi de lieux, groupes de jeu, amis et matchs.
            </li>
            <li>
              <strong>Collection et jeu :</strong> collections de cartes, listes de souhaits,
              decks, cubes, scan de cartes, échanges et listes de vente entre utilisateurs.
            </li>
            <li>
              <strong>Contenus de jeu :</strong> bases de cartes, règles, rulings, politiques de
              tournoi, errata communautaires soumis au vote, quizz et actualités.
            </li>
            <li>
              <strong>Intégrations :</strong> API publique, clés d&apos;API, serveur MCP,
              applications tierces via OAuth et bot Discord.
            </li>
          </LegalList>
          <p>
            Les contenus liés aux jeux (cartes, règles, rulings) sont fournis à titre informatif.
            Ils peuvent comporter des erreurs, des retards de mise à jour ou des traductions
            automatiques : seuls les documents officiels des éditeurs et l&apos;arbitrage sur place
            font foi.
          </p>
        </>
      ),
    },
    {
      id: "contenus",
      title: "Contenus publiés par les utilisateurs",
      content: (
        <>
          <p>
            Vous restez propriétaire des contenus que vous publiez (événements, descriptions,
            images, decks, commentaires, rulings proposés, etc.).
          </p>
          <p>
            En les publiant, vous accordez à Joutes une licence non exclusive, mondiale et gratuite
            d&apos;héberger, reproduire, afficher, adapter techniquement (redimensionnement,
            indexation, traduction) et diffuser ces contenus, pour la seule durée de leur
            publication sur la Plateforme et pour les besoins du fonctionnement du service, y
            compris via l&apos;API et les intégrations.
          </p>
          <p>
            Vous garantissez disposer des droits nécessaires sur les contenus publiés, notamment
            sur les images, logos et textes provenant de tiers, et vous êtes seul responsable de
            leur licéité.
          </p>
          <p>
            La suppression d&apos;un contenu met fin à sa diffusion. Certains contenus rattachés à
            des données partagées (résultats de tournoi, historiques de matchs ou d&apos;échanges)
            peuvent être conservés pour préserver la cohérence de l&apos;historique des autres
            participants.
          </p>
        </>
      ),
    },
    {
      id: "conduite",
      title: "Règles de conduite",
      content: (
        <>
          <p>En utilisant la Plateforme, vous vous engagez à ne pas :</p>
          <LegalList>
            <li>
              publier de contenu illégal, haineux, diffamatoire, harcelant, pornographique ou
              manifestement inapproprié ;
            </li>
            <li>
              porter atteinte aux droits d&apos;autrui, notamment de propriété intellectuelle ;
            </li>
            <li>
              publier de fausses informations, de faux événements, de faux résultats ou tricher
              dans un tournoi ;
            </li>
            <li>
              collecter, extraire massivement ou republier les données de la Plateforme en dehors
              des usages prévus par l&apos;API ;
            </li>
            <li>
              perturber le fonctionnement du service (charge anormale, contournement des limites,
              tentative d&apos;intrusion, accès à des zones non autorisées) ;
            </li>
            <li>
              utiliser la Plateforme à des fins publicitaires ou commerciales sans rapport avec les
              jeux et sans autorisation ;
            </li>
            <li>
              adopter un comportement irrespectueux envers les autres utilisateurs, les
              organisateurs ou les arbitres.
            </li>
          </LegalList>
        </>
      ),
    },
    {
      id: "evenements",
      title: "Événements, tournois et ligues",
      content: (
        <>
          <p>
            Les événements et tournois publiés sur la Plateforme sont organisés par les
            utilisateurs, les boutiques ou les associations qui les créent, sous leur seule
            responsabilité. Joutes fournit un outil de publication et de gestion : la Plateforme
            n&apos;organise pas ces événements, n&apos;en est pas co-organisatrice et ne garantit
            ni leur tenue, ni leurs conditions, ni les lots annoncés.
          </p>
          <p>Les organisateurs s&apos;engagent à :</p>
          <LegalList>
            <li>
              publier des informations exactes (lieu, date, format, prix d&apos;entrée, lots) ;
            </li>
            <li>
              respecter la réglementation applicable ainsi que les règles et politiques des
              éditeurs des jeux concernés ;
            </li>
            <li>
              n&apos;utiliser les informations des participants (identité, contact, résultats) que
              pour les besoins de l&apos;événement, et respecter la réglementation sur les données
              personnelles pour les traitements qu&apos;ils réalisent de leur côté.
            </li>
          </LegalList>
          <p>
            Les participants acceptent que leur pseudonyme, leurs inscriptions, leurs appariements
            et leurs résultats soient visibles des autres participants et, pour les événements
            publics, de toute personne consultant la page correspondante.
          </p>
        </>
      ),
    },
    {
      id: "echanges",
      title: "Collections, échanges et listes de vente",
      content: (
        <>
          <p>
            Les fonctionnalités de collection, d&apos;échange et de liste de vente sont des outils
            de suivi et de mise en relation. La Plateforme n&apos;est pas partie aux transactions
            conclues entre utilisateurs : elle ne détient aucune carte, n&apos;encaisse aucun
            paiement à ce titre, ne procède à aucune expédition et n&apos;offre aucune garantie de
            bonne fin.
          </p>
          <p>
            Les utilisateurs sont seuls responsables de la réalité, de la conformité et de la
            légalité de leurs transactions, ainsi que du respect de leurs éventuelles obligations
            fiscales et déclaratives. Il vous appartient de prendre les précautions nécessaires
            avant tout échange ou toute vente.
          </p>
          <p>
            Les données de collection saisies sont déclaratives : elles ne constituent ni une
            preuve de propriété, ni une estimation de valeur.
          </p>
        </>
      ),
    },
    {
      id: "moderation",
      title: "Modération et signalements",
      content: (
        <>
          <p>
            Tout utilisateur connecté peut signaler un contenu qui lui semble contraire aux
            présentes CGU ou à la loi, à l&apos;aide du bouton de signalement présent sur les
            contenus concernés.
          </p>
          <p>
            Les signalements sont examinés par l&apos;équipe de la Plateforme. Nous pouvons
            masquer, modifier ou supprimer tout contenu manifestement illicite ou contraire aux
            CGU, et restreindre l&apos;accès du compte à l&apos;origine de la publication, sans que
            cela crée une obligation générale de surveillance des contenus.
          </p>
          <p>
            Les signalements abusifs ou répétés sans fondement peuvent eux-mêmes donner lieu à une
            mesure de restriction.
          </p>
        </>
      ),
    },
    {
      id: "developpeurs",
      title: "API, MCP et applications tierces",
      content: (
        <>
          <p>
            La Plateforme expose une API, un serveur MCP et un mécanisme d&apos;autorisation OAuth
            permettant à des applications tierces d&apos;accéder à certaines données. L&apos;usage
            de ces interfaces est décrit sur la page{" "}
            <Link href="/integrations" className="text-primary hover:underline">
              Intégrations et Développeurs
            </Link>
            .
          </p>
          <LegalList>
            <li>
              Vos clés d&apos;API sont personnelles et confidentielles : les appels qui en sont
              issus vous sont imputables.
            </li>
            <li>
              En autorisant une application tierce, vous lui donnez accès aux données couvertes par
              l&apos;autorisation accordée. Vous pouvez révoquer cet accès depuis votre compte.
            </li>
            <li>
              Les applications tierces ne sont ni éditées, ni contrôlées, ni garanties par Joutes ;
              leurs propres conditions et politiques leur sont applicables.
            </li>
            <li>
              Nous pouvons appliquer des limites d&apos;usage et suspendre une clé ou une
              application en cas d&apos;usage abusif, de charge excessive ou de risque pour le
              service.
            </li>
          </LegalList>
          <p>
            L&apos;API est fournie sans garantie de stabilité : ses formats et points d&apos;entrée
            peuvent évoluer.
          </p>
        </>
      ),
    },
    {
      id: "ia",
      title: "Fonctionnalités assistées par IA",
      content: (
        <>
          <p>
            Certaines fonctionnalités s&apos;appuient sur des modèles d&apos;intelligence
            artificielle fournis par un prestataire tiers, par exemple la reconnaissance de cartes
            scannées, la vérification de decks, l&apos;import de quizz ou l&apos;extraction
            d&apos;informations d&apos;événements.
          </p>
          <p>
            Les résultats produits sont indicatifs et peuvent être incomplets ou erronés. Ils ne
            remplacent ni la vérification par l&apos;utilisateur, ni la décision d&apos;un arbitre,
            ni les documents officiels des éditeurs.
          </p>
          <p>
            Les contenus que vous soumettez à ces fonctionnalités sont transmis au prestataire
            concerné pour produire la réponse. Le détail figure dans la{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: "propriete",
      title: "Propriété intellectuelle",
      content: (
        <>
          <p>
            La Plateforme, sa structure, son interface et ses éléments graphiques sont protégés par
            le droit de la propriété intellectuelle. Les composants publiés en open source restent
            régis par leurs licences respectives.
          </p>
          <p>
            Les noms, logos, visuels de cartes, textes de règles et marques des jeux mentionnés
            appartiennent à leurs éditeurs et ayants droit respectifs. Ils sont utilisés à des fins
            d&apos;information et de référencement communautaire, dans le cadre des politiques de
            contenus non officiels des éditeurs concernés.
          </p>
          <p>
            <strong>Joutes n&apos;est affiliée à aucun éditeur de jeu</strong> et n&apos;est ni
            sponsorisée, ni approuvée par eux.
          </p>
          <p>
            Tout ayant droit qui estimerait qu&apos;un contenu porte atteinte à ses droits peut
            nous contacter via les{" "}
            <a href="#contact" className="text-primary hover:underline">
              canaux de contact
            </a>{" "}
            : le contenu litigieux sera examiné et, le cas échéant, retiré.
          </p>
        </>
      ),
    },
    {
      id: "donnees",
      title: "Données personnelles",
      content: (
        <>
          <p>
            Le traitement des données personnelles des utilisateurs est décrit en détail dans la{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              politique de confidentialité
            </Link>
            , qui fait partie intégrante des présentes CGU. Elle précise les données collectées,
            les finalités et bases légales, les destinataires, les durées de conservation ainsi que
            les modalités d&apos;exercice de vos droits.
          </p>
          <p>
            Certaines informations que vous renseignez sont publiques par nature (pseudonyme,
            participations à des événements publics, résultats de tournoi, profil si vous
            l&apos;avez rendu public). Il vous appartient de ne pas publier d&apos;informations
            personnelles que vous ne souhaitez pas rendre accessibles.
          </p>
        </>
      ),
    },
    {
      id: "disponibilite",
      title: "Disponibilité et évolution du service",
      content: (
        <>
          <p>
            La Plateforme est fournie « en l&apos;état » et « selon disponibilité ». Nous nous
            efforçons d&apos;assurer un service accessible et fiable, sans pouvoir garantir une
            disponibilité continue ni l&apos;absence d&apos;erreurs.
          </p>
          <p>
            L&apos;accès peut être suspendu, limité ou interrompu à tout moment, notamment pour des
            opérations de maintenance, des mises à jour, des raisons de sécurité ou des contraintes
            techniques liées à nos prestataires.
          </p>
          <p>
            Les fonctionnalités peuvent être ajoutées, modifiées ou retirées, y compris
            lorsqu&apos;elles sont proposées à titre expérimental. Nous recommandons
            d&apos;exporter régulièrement les données auxquelles vous tenez lorsque cette
            possibilité est offerte.
          </p>
        </>
      ),
    },
    {
      id: "responsabilite",
      title: "Limitation de responsabilité",
      content: (
        <>
          <p>
            Notre responsabilité est limitée aux dommages directs résultant d&apos;une faute
            prouvée de notre part. Nous ne saurions être tenus responsables :
          </p>
          <LegalList>
            <li>
              des contenus publiés par les utilisateurs, de leur exactitude et de leur licéité ;
            </li>
            <li>
              du déroulement, de l&apos;annulation ou des conséquences des événements, tournois,
              échanges et ventes organisés ou conclus entre utilisateurs ;
            </li>
            <li>
              des interactions et litiges entre utilisateurs, y compris en dehors de la Plateforme ;
            </li>
            <li>
              des erreurs ou retards affectant les données de jeu, les règles, les rulings ou les
              résultats produits par des fonctionnalités automatiques ;
            </li>
            <li>
              des dommages indirects (perte de données, perte de chance, préjudice commercial ou
              d&apos;image) ;
            </li>
            <li>
              des indisponibilités, dysfonctionnements ou pertes imputables à un service tiers ou à
              un cas de force majeure.
            </li>
          </LegalList>
          <p>
            Aucune stipulation des présentes CGU n&apos;a pour effet d&apos;écarter la
            responsabilité qui ne peut légalement être limitée, notamment en cas de faute lourde ou
            dolosive.
          </p>
        </>
      ),
    },
    {
      id: "resiliation",
      title: "Suspension et suppression du compte",
      content: (
        <>
          <p>
            Vous pouvez cesser d&apos;utiliser la Plateforme à tout moment et demander la
            suppression de votre compte via les{" "}
            <a href="#contact" className="text-primary hover:underline">
              canaux de contact
            </a>
            . La suppression entraîne l&apos;effacement ou l&apos;anonymisation de vos données
            personnelles dans les conditions décrites par la{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
          <p>
            Nous pouvons suspendre ou supprimer un compte, ainsi que retirer les contenus associés,
            en cas de violation des présentes CGU, d&apos;activité illicite, de risque pour la
            sécurité du service ou d&apos;atteinte aux autres utilisateurs. Sauf urgence, illicéité
            manifeste ou récidive, une information préalable est adressée à l&apos;utilisateur
            concerné, qui peut contester la mesure via les canaux de contact.
          </p>
        </>
      ),
    },
    {
      id: "droit",
      title: "Droit applicable et litiges",
      content: (
        <>
          <p>
            Les présentes CGU sont régies par le droit français. Elles sont rédigées en français ;
            toute traduction est fournie à titre de commodité et le texte français prévaut.
          </p>
          <p>
            En cas de difficulté, nous vous invitons à nous contacter en priorité afin de
            rechercher une solution amiable. À défaut d&apos;accord, le litige pourra être porté
            devant les juridictions françaises compétentes. Si vous êtes consommateur, vous
            conservez le droit de saisir la juridiction du lieu de votre domicile.
          </p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      content: (
        <>
          <p>
            Pour toute question relative aux présentes CGU, un signalement de contenu ou une
            demande concernant votre compte :
          </p>
          <LegalList>
            <li>
              <strong>Discord :</strong> <LegalLink href={LEGAL_CONTACT.discord} />
            </li>
            <li>
              <strong>GitHub :</strong> <LegalLink href={LEGAL_CONTACT.github} />
            </li>
          </LegalList>
          <p>
            Les demandes relatives aux données personnelles sont traitées selon les modalités
            décrites dans la{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </>
      ),
    },
  ],
};
