import { Link } from "@/i18n/navigation.ts";
import {
  LEGAL_CONTACT,
  LegalDocumentContent,
  LegalLink,
  LegalList,
  LegalTable,
} from "@/components/legal/LegalDocument.tsx";

export const privacyFr: LegalDocumentContent = {
  meta: {
    title: "Politique de confidentialité",
    description:
      "Comment Joutes collecte, utilise et protège vos données personnelles : données traitées, finalités, destinataires, durées de conservation et exercice de vos droits.",
    keywords: [
      "politique de confidentialité",
      "données personnelles",
      "rgpd",
      "vie privée",
      "cookies",
      "joutes",
    ],
  },
  documentLabel: "Document légal",
  title: "Politique de confidentialité",
  description:
    "Quelles données Joutes collecte, pourquoi, avec qui elles sont partagées et comment garder la main dessus.",
  lastUpdated: (date) => `Dernière mise à jour : ${date}`,
  crossLinks: (
    <>
      Voir aussi les{" "}
      <Link href="/cgu" className="text-primary hover:underline">
        conditions générales d&apos;utilisation
      </Link>
      .
    </>
  ),
  highlightTitle: "L'essentiel",
  highlight: (
    <ul className="list-disc space-y-2 pl-6">
      <li>Nous ne collectons que ce qui est nécessaire au fonctionnement de la Plateforme.</li>
      <li>Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.</li>
      <li>
        Aucun cookie publicitaire, aucun traceur de profilage : la mesure d&apos;audience est
        anonyme.
      </li>
      <li>
        Votre position n&apos;est utilisée que si vous la fournissez, pour trouver des événements
        proches de vous.
      </li>
      <li>
        Vous pouvez consulter, corriger, exporter ou faire supprimer vos données à tout moment.
      </li>
    </ul>
  ),
  summaryTitle: "Sommaire",
  articles: [
    {
      id: "responsable",
      title: "Qui traite vos données",
      content: (
        <>
          <p>
            La plateforme Joutes, accessible à l&apos;adresse{" "}
            <a href="https://joutes.app" className="text-primary hover:underline">
              https://joutes.app
            </a>
            , est éditée par Nakasar, qui agit en qualité de responsable de traitement pour les
            données décrites dans la présente politique.
          </p>
          <p>
            La présente politique s&apos;applique à l&apos;ensemble des services de la Plateforme :
            site web, API publique, serveur MCP et bot Discord. Elle complète les{" "}
            <Link href="/cgu" className="text-primary hover:underline">
              conditions générales d&apos;utilisation
            </Link>
            .
          </p>
          <p>
            Pour toute question ou demande relative à vos données, les canaux de contact sont
            indiqués en fin de document.
          </p>
        </>
      ),
    },
    {
      id: "donnees",
      title: "Données que nous collectons",
      content: (
        <>
          <p>
            Nous collectons uniquement les données nécessaires au fonctionnement du service. La
            plupart proviennent directement de vous ; certaines sont générées par votre utilisation
            de la Plateforme.
          </p>
          <p>
            <strong>Compte et authentification</strong>
          </p>
          <LegalList>
            <li>adresse email ;</li>
            <li>
              codes de connexion à usage unique, valables quelques minutes, envoyés par email ;
            </li>
            <li>
              si vous vous connectez avec Discord : identifiant, nom d&apos;utilisateur, avatar et
              adresse email associés à ce compte ;
            </li>
            <li>
              si vous utilisez une clé d&apos;accès (passkey) : la clé publique et ses métadonnées
              techniques — aucune donnée biométrique ne nous est transmise, elle ne quitte jamais
              votre appareil ;
            </li>
            <li>
              sessions actives : jeton de session, dates de création et d&apos;expiration, adresse
              IP et navigateur utilisés lors de la connexion.
            </li>
          </LegalList>
          <p>
            <strong>Profil et préférences</strong>
          </p>
          <LegalList>
            <li>
              nom d&apos;utilisateur, nom affiché, description, image de profil, site web et liens
              sociaux que vous renseignez ;
            </li>
            <li>code ami, visibilité publique du profil ;</li>
            <li>
              jeux et lieux suivis, langue d&apos;affichage, thème, préférences de notifications.
            </li>
          </LegalList>
          <p>
            <strong>Localisation</strong>
          </p>
          <LegalList>
            <li>
              une position par défaut (latitude et longitude) si vous choisissez de
              l&apos;enregistrer dans votre compte ;
            </li>
            <li>
              une position ponctuelle, saisie manuellement ou fournie par votre navigateur après
              votre autorisation explicite, utilisée le temps d&apos;une recherche
              d&apos;événements à proximité et non conservée en base à cette occasion.
            </li>
          </LegalList>
          <p>
            <strong>Contenus et activité</strong>
          </p>
          <LegalList>
            <li>
              événements créés et inscriptions, tournois et ligues (appariements, résultats,
              classements), matchs et groupes de jeu ;
            </li>
            <li>amis et demandes d&apos;amis, lieux suivis, appartenance à des lieux privés ;</li>
            <li>collections, listes de souhaits, decks, cubes, échanges et listes de vente ;</li>
            <li>
              contributions communautaires : rulings, errata et votes associés, quizz, actualités,
              signalements de contenus ;
            </li>
            <li>succès obtenus et notifications reçues.</li>
          </LegalList>
          <p>
            <strong>Intégrations et développeurs</strong>
          </p>
          <LegalList>
            <li>
              clés d&apos;API : nom, description, préfixe, date de dernière utilisation et compteur
              d&apos;appels — la clé elle-même est stockée sous forme hachée ;
            </li>
            <li>applications tierces autorisées via OAuth et autorisations accordées ;</li>
            <li>identifiants nécessaires au fonctionnement du bot Discord et du serveur MCP.</li>
          </LegalList>
          <p>
            <strong>Données techniques</strong>
          </p>
          <LegalList>
            <li>
              journaux générés par l&apos;hébergement : adresse IP, horodatage, ressource demandée,
              navigateur et système ;
            </li>
            <li>
              mesure d&apos;audience agrégée (pages consultées, provenance) sans identifiant
              permettant de vous reconnaître.
            </li>
          </LegalList>
          <p>
            Nous ne collectons volontairement aucune donnée sensible au sens de l&apos;article 9 du
            RGPD. Merci de ne pas en publier dans les champs libres (description de profil,
            descriptions d&apos;événements, messages).
          </p>
        </>
      ),
    },
    {
      id: "finalites",
      title: "Pourquoi et sur quelle base légale",
      content: (
        <>
          <p>
            Chaque traitement répond à une finalité déterminée et repose sur une base légale au
            sens du RGPD :
          </p>
          <LegalTable
            headers={["Finalité", "Données concernées", "Base légale"]}
            rows={[
              [
                "Créer et gérer votre compte, vous authentifier",
                "Email, identifiants de connexion, sessions, profil",
                "Exécution des CGU (contrat)",
              ],
              [
                "Fournir les fonctionnalités : événements, tournois, collections, échanges, communauté",
                "Contenus et activité que vous créez",
                "Exécution des CGU (contrat)",
              ],
              [
                "Afficher les événements proches de vous",
                "Position enregistrée ou position ponctuelle du navigateur",
                "Consentement (révocable à tout moment)",
              ],
              [
                "Envoyer les emails de connexion et les notifications de service",
                "Adresse email",
                "Exécution des CGU (contrat)",
              ],
              [
                "Envoyer le récapitulatif hebdomadaire et les actualités de la Plateforme",
                "Adresse email, jeux et lieux suivis",
                "Consentement (désactivable dans les préférences)",
              ],
              [
                "Assurer la sécurité, prévenir les abus, modérer les contenus signalés",
                "Journaux techniques, signalements, données de compte",
                "Intérêt légitime à protéger le service et ses utilisateurs",
              ],
              [
                "Mesurer l'audience et améliorer la Plateforme",
                "Statistiques agrégées de navigation",
                "Intérêt légitime (mesure anonyme, sans profilage)",
              ],
              [
                "Répondre à vos demandes et à vos exercices de droits",
                "Contenu de la demande, données de compte",
                "Obligation légale",
              ],
            ]}
          />
          <p>
            Vos données ne sont ni vendues, ni louées, ni utilisées à des fins de publicité ciblée,
            et ne font l&apos;objet d&apos;aucune décision automatisée produisant des effets
            juridiques à votre égard.
          </p>
        </>
      ),
    },
    {
      id: "visibilite",
      title: "Ce qui est visible par les autres utilisateurs",
      content: (
        <>
          <p>
            Joutes est une plateforme communautaire : une partie de vos données est, par nature,
            visible par d&apos;autres personnes.
          </p>
          <LegalList>
            <li>
              <strong>Publiquement accessible</strong> (y compris aux moteurs de recherche) : votre
              nom d&apos;utilisateur et votre avatar lorsqu&apos;ils apparaissent sur un contenu
              public, les événements que vous publiez, les tournois publics et leurs résultats, les
              contributions communautaires (rulings, errata, quizz).
            </li>
            <li>
              <strong>Visible si vous l&apos;activez :</strong> les informations de profil
              (description, site web, liens sociaux, jeux et lieux suivis) lorsque le profil public
              est activé dans votre compte.
            </li>
            <li>
              <strong>Visible d&apos;un cercle restreint :</strong> vos amis, les membres de vos
              groupes de jeu et de vos lieux privés, ainsi que les participants et organisateurs
              des événements auxquels vous vous inscrivez.
            </li>
            <li>
              <strong>Privé par défaut :</strong> votre adresse email, votre position enregistrée,
              vos collections, listes de souhaits, decks et cubes, tant que vous ne les partagez
              pas.
            </li>
          </LegalList>
          <p>
            Les organisateurs d&apos;événements et de tournois accèdent aux informations des
            participants nécessaires au déroulement de l&apos;événement. Ils sont responsables des
            usages qu&apos;ils en font en dehors de la Plateforme.
          </p>
        </>
      ),
    },
    {
      id: "cookies",
      title: "Cookies et mesure d'audience",
      content: (
        <>
          <p>La Plateforme utilise un nombre volontairement réduit de traceurs :</p>
          <LegalList>
            <li>
              <strong>Cookies strictement nécessaires :</strong> cookie de session permettant de
              vous maintenir connecté, cookie de langue (<code>NEXT_LOCALE</code>) et cookies
              techniques de sécurité.
            </li>
            <li>
              <strong>Stockage local :</strong> votre préférence de thème (clair, sombre ou
              système) est conservée dans votre navigateur et n&apos;est jamais transmise à nos
              serveurs.
            </li>
            <li>
              <strong>Mesure d&apos;audience :</strong> Vercel Web Analytics produit des
              statistiques agrégées de fréquentation sans déposer de cookie publicitaire, sans
              identifiant persistant et sans suivi entre sites.
            </li>
          </LegalList>
          <p>
            Nous n&apos;utilisons ni régie publicitaire, ni traceur de profilage tiers. Ces
            traitements relèvent des cookies strictement nécessaires au service et de la mesure
            d&apos;audience anonyme, exemptés de recueil du consentement ; aucun bandeau cookies
            n&apos;est donc affiché.
          </p>
          <p>
            Vous pouvez à tout moment supprimer ces cookies depuis votre navigateur ; la
            déconnexion de votre compte en sera la conséquence.
          </p>
        </>
      ),
    },
    {
      id: "prestataires",
      title: "Hébergement et prestataires",
      content: (
        <>
          <p>
            Nous faisons appel à un nombre limité de prestataires techniques, qui agissent comme
            sous-traitants pour notre compte et n&apos;utilisent pas vos données à leurs propres
            fins :
          </p>
          <LegalTable
            headers={["Prestataire", "Rôle", "Données concernées"]}
            rows={[
              [
                "Vercel Inc.",
                "Hébergement de la Plateforme, stockage des images, mesure d'audience",
                "Ensemble des données transitant par le service, journaux techniques, images publiées",
              ],
              ["MongoDB", "Base de données", "Comptes, profils, contenus et activité"],
              [
                "Meilisearch",
                "Moteur de recherche des cartes et contenus de jeu",
                "Requêtes de recherche et données de jeu (pas de données de compte)",
              ],
              ["Resend", "Envoi des emails", "Adresse email et contenu du message envoyé"],
              [
                "OpenAI",
                "Fonctionnalités assistées par IA",
                "Contenus que vous soumettez à ces fonctionnalités",
              ],
              [
                "Discord",
                "Connexion via Discord, bot communautaire",
                "Identifiant et profil Discord, messages échangés avec le bot",
              ],
            ]}
          />
          <p>
            En dehors de ces prestataires, vos données ne sont communiquées à des tiers que : aux
            applications que vous avez vous-même autorisées via OAuth ou vos clés d&apos;API, et
            aux autorités administratives ou judiciaires lorsque la loi nous y oblige.
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
            Certaines fonctionnalités facultatives reposent sur des modèles d&apos;intelligence
            artificielle exploités par un prestataire tiers :
          </p>
          <LegalList>
            <li>
              <strong>Scan de cartes :</strong> l&apos;image que vous photographiez est transmise
              au prestataire pour identifier la carte ; elle n&apos;est pas conservée sur nos
              serveurs.
            </li>
            <li>
              <strong>Vérification de decks :</strong> la liste de cartes soumise est transmise
              pour analyse.
            </li>
            <li>
              <strong>Import de quizz et récupération d&apos;événements :</strong> les textes ou
              pages fournis sont transmis pour en extraire des informations structurées.
            </li>
          </LegalList>
          <p>
            Seul le contenu nécessaire au traitement est transmis, sans votre identité ni vos
            coordonnées. Ces contenus ne sont pas utilisés pour entraîner des modèles. Si vous ne
            souhaitez pas recourir à ces traitements, il vous suffit de ne pas utiliser les
            fonctionnalités concernées.
          </p>
        </>
      ),
    },
    {
      id: "transferts",
      title: "Transferts hors Union européenne",
      content: (
        <>
          <p>
            Certains de nos prestataires sont établis aux États-Unis ou peuvent y traiter des
            données. Ces transferts sont encadrés par les garanties prévues par le chapitre V du
            RGPD, notamment les clauses contractuelles types de la Commission européenne et, le cas
            échéant, la certification au Data Privacy Framework du prestataire concerné.
          </p>
          <p>
            Vous pouvez nous demander des précisions sur les garanties applicables à un prestataire
            déterminé via les canaux de contact.
          </p>
        </>
      ),
    },
    {
      id: "conservation",
      title: "Durées de conservation",
      content: (
        <LegalTable
          headers={["Donnée", "Durée"]}
          rows={[
            [
              "Compte, profil et préférences",
              "Tant que le compte existe, puis suppression ou anonymisation après votre demande",
            ],
            [
              "Sessions de connexion",
              "7 jours maximum, renouvelées à l'usage et révocables à tout moment",
            ],
            ["Codes de connexion envoyés par email", "10 minutes"],
            [
              "Contenus publiés (événements, decks, collections, contributions)",
              "Jusqu'à leur suppression par vos soins ou celle de votre compte",
            ],
            [
              "Historiques partagés (résultats de tournois, matchs, échanges)",
              "Conservés pour la cohérence de l'historique des autres participants, dissociés de votre compte après suppression",
            ],
            ["Clés d'API et autorisations d'applications", "Jusqu'à leur révocation"],
            [
              "Signalements de contenus",
              "Le temps du traitement, puis une durée limitée à des fins de suivi de la modération",
            ],
            [
              "Journaux techniques",
              "Durée courte définie par l'hébergeur, à des fins de sécurité et de diagnostic",
            ],
            ["Statistiques d'audience", "Conservées sous forme agrégée, sans identification"],
          ]}
        />
      ),
    },
    {
      id: "securite",
      title: "Sécurité",
      content: (
        <>
          <p>Nous mettons en œuvre des mesures adaptées à la nature du service :</p>
          <LegalList>
            <li>chiffrement des échanges en HTTPS ;</li>
            <li>
              authentification sans mot de passe (code à usage unique, clé d&apos;accès ou compte
              Discord), qui supprime le risque lié à la réutilisation de mots de passe ;
            </li>
            <li>stockage haché des clés d&apos;API et des jetons sensibles ;</li>
            <li>
              accès aux données de production restreint aux personnes qui en ont besoin pour
              l&apos;exploitation du service ;
            </li>
            <li>cloisonnement des données privées et contrôle des autorisations côté serveur.</li>
          </LegalList>
          <p>
            Aucun système n&apos;est infaillible. En cas de violation de données susceptible
            d&apos;engendrer un risque élevé pour vos droits et libertés, vous en serez informé
            dans les conditions prévues par le RGPD.
          </p>
        </>
      ),
    },
    {
      id: "droits",
      title: "Vos droits",
      content: (
        <>
          <p>
            Conformément au RGPD et à la loi « Informatique et Libertés », vous disposez des droits
            suivants :
          </p>
          <LegalList>
            <li>
              <strong>Accès :</strong> obtenir une copie des données que nous détenons sur vous ;
            </li>
            <li>
              <strong>Rectification :</strong> corriger des données inexactes — la plupart des
              informations sont modifiables directement depuis votre compte ;
            </li>
            <li>
              <strong>Effacement :</strong> demander la suppression de votre compte et de vos
              données, sous réserve des données que nous devons conserver ;
            </li>
            <li>
              <strong>Opposition :</strong> vous opposer à un traitement fondé sur notre intérêt
              légitime ;
            </li>
            <li>
              <strong>Limitation :</strong> demander le gel temporaire d&apos;un traitement
              contesté ;
            </li>
            <li>
              <strong>Portabilité :</strong> recevoir vos données dans un format structuré et
              lisible par machine ;
            </li>
            <li>
              <strong>Retrait du consentement :</strong> à tout moment, pour les traitements qui en
              dépendent (localisation, emails facultatifs), sans effet sur les traitements déjà
              réalisés ;
            </li>
            <li>
              <strong>Directives post-mortem :</strong> définir le sort de vos données après votre
              décès.
            </li>
          </LegalList>
          <p>
            Pour exercer ces droits, contactez-nous via les canaux indiqués ci-dessous. Une réponse
            vous sera apportée dans un délai d&apos;un mois, prolongeable en cas de demande
            complexe. Nous pouvons être amenés à vérifier votre identité, notamment via
            l&apos;adresse email associée à votre compte.
          </p>
          <p>
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
            réclamation auprès de la CNIL : <LegalLink href="https://www.cnil.fr">www.cnil.fr</LegalLink>.
          </p>
        </>
      ),
    },
    {
      id: "mineurs",
      title: "Mineurs",
      content: (
        <>
          <p>
            La Plateforme est destinée aux personnes âgées d&apos;au moins 15 ans. En dessous de
            cet âge, la création d&apos;un compte suppose l&apos;accord du titulaire de
            l&apos;autorité parentale.
          </p>
          <p>
            Si vous constatez qu&apos;un compte a été créé par un enfant sans cet accord,
            contactez-nous : le compte et les données associées seront supprimés.
          </p>
        </>
      ),
    },
    {
      id: "modifications",
      title: "Modifications de cette politique",
      content: (
        <>
          <p>
            Cette politique peut évoluer avec les fonctionnalités de la Plateforme ou le cadre
            légal applicable. La date de dernière mise à jour figure en haut de la page.
          </p>
          <p>
            En cas de changement substantiel — nouvelle finalité, nouveau destinataire, nouvelle
            catégorie de données — vous en serez informé sur la Plateforme ou par email avant sa
            prise d&apos;effet lorsque cela est requis.
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
            Pour toute question relative à vos données personnelles ou pour exercer vos droits :
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
            Pensez à indiquer l&apos;adresse email associée à votre compte afin que votre demande
            puisse être rattachée au bon utilisateur.
          </p>
        </>
      ),
    },
  ],
};
