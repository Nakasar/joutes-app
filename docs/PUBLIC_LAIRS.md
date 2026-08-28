# Lieux publics créés par les joueurs

## Vue d'ensemble

Un lieu public — une boutique, une association, un club — n'était jusqu'ici
créé que depuis l'administration : un gérant devait écrire à l'équipe et
attendre. Seuls les [lieux privés](./PRIVATE_LAIRS.md) s'ouvraient depuis
l'application.

Un compte connecté crée désormais lui-même son lieu **public** depuis
l'annuaire (`/lairs`), en devient propriétaire, et le règle ensuite depuis
l'écran de gestion habituel (`/lairs/[lairId]/manage`) : jeux, horaires,
agenda, annonces, vitrine.

## Le dialogue de création

Le bouton **« Ajouter un lieu »** de `/lairs` — visible des seuls comptes
connectés — ouvre un dialogue unique pour les deux sortes de lieux. Le choix du
haut décide du reste du formulaire.

| | Lieu public | Lieu privé |
| --- | --- | --- |
| Visibilité | tout le monde, annuaire et calendrier compris | les seuls invités du QR code |
| Nom | requis | requis |
| Adresse | **requise** | facultative |
| Ville (point sur la carte) | **requise** | — |
| Site web | facultatif | — |
| Code d'invitation | aucun | généré à la création |

Les deux exigences propres au public ne sont pas de la paperasse : sans adresse
ni coordonnées, le lieu n'est trouvable ni dans l'annuaire, ni par la recherche
autour de soi — c'est-à-dire nulle part. La ville se choisit dans la liste
d'autocomplétion de `LocationSearchInput` (`/api/geo/places`, Photon), qui rend
les coordonnées ; l'adresse précise reste du texte libre.

Le créateur devient l'unique propriétaire du lieu et le suit d'office, ce qui
fait remonter ses événements dans son calendrier.

## Les deux gardes de la création publique

Elles ne valent que pour le public : un lieu privé ne paraît nulle part et ne
concurrence aucune fiche.

### Le plafond par compte

`MAX_PUBLIC_LAIRS_PER_OWNER` (3, dans `lib/lairs/creation.ts`) borne le nombre
de lieux publics qu'un même compte **a ouverts**. Le décompte porte sur
`createdBy` — le compte qui a créé la fiche —, et non sur `owners`, qui dit qui
la gère aujourd'hui : compter les lieux possédés ferait payer à un gérant les
fiches dont l'équipe lui a confié la gestion, et trois boutiques reprises
l'empêcheraient de déclarer la sienne. Ce que le plafond borne, c'est
l'ouverture de fiches, pas la charge de travail de quelqu'un.

`createdBy` est absent des lieux créés par l'administration : ils ne se comptent
contre personne.

### Le doublon

Un lieu public est refusé quand un autre porte **le même nom au même endroit** :

- le nom est comparé réduit — casse, accents, espaces et ponctuation ôtés, si
  bien que « L'Antre-Temps », « lantre temps » et « L ANTRE TEMPS » sont le même
  nom ;
- l'endroit est comparé à `DUPLICATE_RADIUS_KM` (25 km) près, l'échelle d'une
  agglomération : deux enseignes homonymes à Lyon et à Nantes restent deux
  lieux ;
- quand l'un des deux n'a pas de coordonnées, le doute profite à la fiche
  existante : on ne peut pas affirmer qu'il s'agit d'un autre endroit.

Le refus n'est pas un cul-de-sac : le dialogue nomme le lieu reconnu et propose
d'y aller. Si c'est bien le sien, le gérant en demande la gestion à l'équipe
plutôt que d'ouvrir une seconde fiche.

La base sert les candidats (`findPublicLairsByName`, collation `fr` de force 1
et `alternate: "shifted"`, qui ignore casse, accents, espaces et ponctuation) ;
c'est `findDuplicateLair` qui tranche ensuite sur le nom réduit et la distance.

## Ce que la création n'ouvre pas

Ni bannière, ni jeux, ni **sources d'événements**. Ces champs se remplissent
depuis l'écran de gestion une fois le lieu créé — et le moissonnage
d'événements (`eventsSourceUrls`) reste réservé à l'administration : c'est elle
qui fait sortir le serveur chercher une URL, et cela ne doit pas s'ouvrir par
une simple requête de création.

## Fichiers

### Nouveaux

- **`lib/lairs/creation.ts`** — les règles, sans base ni session : plafond,
  rayon du doublon, réduction d'un nom (`normalizeLairName`), distance de
  haversine (`distanceKm`), reconnaissance d'un doublon (`findDuplicateLair`),
  la conversion en GeoJSON (`toLairLocation`, longitude d'abord) et la
  validation de la charge (`validateLairCreation`). Cette dernière distingue un
  champ **absent** d'un champ **fautif** — `NAME_REQUIRED` contre
  `NAME_TOO_LONG`, `LOCATION_REQUIRED` contre `LOCATION_INVALID` — parce
  qu'annoncer « le nom est requis » à qui vient d'en saisir un de trois cents
  caractères ne lui dit pas ce qu'il doit corriger.
- **`lib/lairs/creation.test.ts`** — leurs cas (`npm run test`).
- **`lib/lairs/create.ts`** — `createLairForUser`, le cœur partagé de la
  création : validation, gardes, écriture, abonnement du créateur. Hors d'un
  module `"use server"`, qui ne peut exporter ni constante ni type.
- **`app/[locale]/(app)/lairs/create-actions.ts`** — `createLairAction` :
  session, délégation, purge des pages. Rend des **codes** de refus, l'annuaire
  étant traduit en quatre langues.
- **`app/[locale]/(app)/lairs/CreateLairButton.tsx`** — le dialogue, qui
  remplace `CreatePrivateLairButton`. Le choix de visibilité est un vrai
  `radiogroup` : un seul de ses deux boutons est atteint par la tabulation, et
  les flèches y circulent en emportant la sélection.

### Modifiés

- **`lib/schemas/lair.schema.ts`** — `lairCreationSchema` : ce qu'un joueur
  envoie, et lui seul ; l'adresse et la localisation exigées pour un lieu
  public.
- **`lib/db/lairs.ts`** — `countPublicLairsCreatedBy`, `findPublicLairsByName`,
  et `createdBy` porté par `toLair` / `toDocument`.
- **`lib/types/Lair.ts`** — `createdBy`, la trace du compte qui a ouvert la
  fiche.
- **`app/[locale]/(app)/lairs/page.tsx`** — le bouton « Ajouter un lieu ».
- **`app/[locale]/(app)/account/private-lairs-actions.ts`** —
  `createPrivateLair` délègue désormais à `createLairForUser` : une seule
  écriture de la règle pour les deux écrans.
- **`messages/{fr,en,de,it}.json`** — `Lairs.create`, qui remplace
  `Lairs.createPrivate`.

## Pistes

- **Basculer la visibilité après coup** — un lieu privé devenu public, et
  l'inverse ; il faut décider du sort du code d'invitation et des abonnés.
- **Revendiquer un lieu existant** — aujourd'hui, le gérant d'une fiche déjà
  présente doit écrire à l'équipe pour en obtenir la propriété.
- **Créer un lieu par l'API** — `POST /api/lairs` n'existe pas : la création
  passe par l'application.
