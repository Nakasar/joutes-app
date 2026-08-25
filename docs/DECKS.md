# Decks : explorateur, fiche et éditeur

Refonte de la fonctionnalité « decks ». Un deck n'est plus une fiche texte : il
porte un **contenu structuré par zone**, un **guide de jeu**, une **visibilité à
trois états**, et se construit dans un **éditeur** plutôt que dans un
formulaire. Une **librairie publique** expose les listes publiées.

## Écrans

| Route | Rôle |
| --- | --- |
| `/decks` | Mes decks : onglets Tous / En cours / Publiés / Favoris, cartes denses avec badges de visibilité et de légalité |
| `/decks/library` | Librairie publique : decks du moment, filtres (jeu, format, légende, domaines), tris, « Copier chez moi » |
| `/decks/[deckId]` | Fiche du deck. Vue auteur (description, cartes, guide, confrontations, éditables sur place) ou vue visiteur (lecture seule, courbe, légalité, copie) |
| `/decks/[deckId]/edit` | Éditeur : catalogue à gauche, zones au centre, six panneaux d'analyse à droite |

La fiche est la page d'atterrissage d'un deck, y compris pour son auteur :
l'éditeur ne s'atteint que par le bouton **Construire**. Lire un deck et le
modifier sont deux gestes distincts.

## Modèle

`lib/types/Deck.ts` — champs ajoutés au document `decks` :

| Champ | Type | Note |
| --- | --- | --- |
| `visibility` | `private \| unlisted \| public` | `unlisted` = accessible par lien, absent de la librairie |
| `cards` | `Partial<Record<DeckZoneKey, {cardId, quantity}[]>>` | contenu structuré, écrit par l'éditeur |
| `guide` | `{title, body}[]` | guide de jeu par sections |
| `matchups` | `{name, rating}[]` | confrontations, `favorable \| even \| unfavorable` |
| `notes` | `string` | aide-mémoire privé, jamais servi à un visiteur |
| `format` | `string` | format visé, tiré de `Game.formats` |
| `legendCardId` / `legendName` | `string` | carte qui donne son identité au deck |
| `domains` | `string[]` | **dérivé** du contenu à chaque enregistrement, pour le filtre de la librairie |
| `favoritesCount` | `number` | dénormalisé, pour trier sans lire tout le tableau `favoritedBy` |
| `views` | `number` | consultations par un autre que l'auteur |
| `version` | `number` | incrémenté à chaque enregistrement du contenu |

Le champ texte `decklist` est conservé : il porte les decks des jeux sans
catalogue de cartes, et reste ce que l'on colle dans un client de jeu.
L'éditeur le réécrit à partir du contenu structuré à chaque enregistrement.

Rien de ce qui se calcule n'est stocké : la **taille** du deck et son **badge de
légalité** sont toujours dérivés de `cards` et des zones du jeu, jamais recopiés
dans le document.

## Zones (`lib/decks/zones.ts`)

Les zones sont déclarées par le jeu, pas par le deck.

- **Riftbound** : Légende (1), Champions (≤ 3), Deck principal (≥ 40), Runes
  (12), Battlefields (3), Réserve (≤ 10).
- **Générique** (tout autre jeu) : Deck principal (≥ 60), Réserve (≤ 15), Zone
  extra (≤ 15).

Une zone porte une contrainte (`exact` / `min` / `max` / `none`) et un drapeau
`curve` : seules les zones qui le portent entrent dans la courbe de coûts —
mêler douze runes à coût 0 au deck principal écraserait la lecture.

Les clés (`legend`, `maindeck`, `runes`…) sont écrites en base : elles ne
changent pas de nom sans migration.

## Calculs (`lib/decks/contents.ts`)

`deckSize`, `deckLegality`, `countNonCompliantZones`, `costCurve`, `typeSplit`,
`maxCopies` — tous purs, tous testés (`lib/decks/contents.test.ts`). Les mêmes
fonctions servent la fiche, l'éditeur et la page publique : les trois écrans ne
peuvent pas dire trois choses différentes du même deck.

Le **coût** d'une carte est lu par `lib/decks/card-info.ts`, qui essaie
`cost`, `energy`, `mana`, `manaValue`, `manaCost` dans cet ordre. Un jeu dont le
catalogue ne porte aucun de ces attributs n'a simplement pas de courbe.

## Listes texte (`lib/decks/text.ts`)

`parseDeckText` lit une liste collée (« Légende : » puis « 2 Nom de carte »),
reconnaît les en-têtes des zones du jeu et quelques synonymes anglais, fusionne
les doublons et range dans la zone principale ce qui précède tout en-tête.
`stringifyDeckText` écrit la forme canonique. `applyDeckText` apparie les noms
au catalogue — sans casse ni accents — et rend ce qui n'a pas été trouvé.

C'est le même format que le vérificateur de deck de Riftbound
(`games/riftbound/deck-checker/utils.ts`), en version indépendante du jeu.

## API

| Route | Nouveautés |
| --- | --- |
| `GET /api/decks` | `scope=public` (librairie, jamais de deck non répertorié), `format`, `legendCardId`, `domain` (répétable), `sortBy=favoritesCount\|views`, `visibility` répétable |
| `PATCH /api/decks/[deckId]` | accepte `cards`, `guide`, `matchups`, `notes`, `format`, `legendCardId`, `visibility=unlisted` |
| `GET /api/decks/[deckId]` | les `notes` sont retirées pour qui n'est pas l'auteur |
| `POST /api/decks/[deckId]/copy` | « Copier chez moi » — la copie arrive **privée**, nom suffixé si besoin |
| `GET /api/decks/legends` | légendes jouées par les decks publiés, avec leur nombre de decks (combobox de la librairie) |
| `GET/POST /api/games/[gameId]/deck-cards` | cartes d'un deck par identifiant, ou appariement par nom (onglet « Texte ») |

### Règles de visibilité

- `searchDecks({ scope: "public" })` ne rend **que** des decks `public`. Un deck
  `unlisted` n'y entre pas, pas même pour son auteur.
- `GET /api/decks?visibility=unlisted` est refusé hors de `scope=mine` : une
  liste accessible par lien ne se demande pas en lot.
- `/decks/[deckId]` sert un deck `unlisted` à qui a le lien ; seul `private` se
  referme sur son auteur.
- Les métadonnées portent `robots: { index: false }` pour `private` **et**
  `unlisted` (`isDeckIndexable`).

## Collection

Deux moitiés, volontairement séparées :

- `lib/decks/collection.ts` (serveur) compte ce que le lecteur **possède**, par
  nom et toutes impressions confondues — jouer sa version alternative d'une
  carte reste jouer cette carte. Rend une table `cardId → exemplaires`.
- `collectionCoverage()` (`lib/decks/contents.ts`, pur) en déduit ce qui est
  **couvert** et ce qui **manque** à partir du contenu courant. Un exemplaire ne
  compte qu'une fois même si le deck joue la carte dans deux zones.

La couverture se recalcule à chaque rendu de l'éditeur : un panneau qui
annoncerait « 51 possédées » sur un deck dont on vient de retirer dix cartes
commenterait un deck qui n'existe plus.

## Code d'export

`lib/decks/export-code.ts` produit le code Riftbound (`@piltoverarchive/riftbound-deck-codes`)
à partir des zones. Calculé **côté serveur** — la bibliothèque n'a rien à faire
dans le paquet du navigateur pour un bouton « copier » — et absent des autres
jeux, qui n'ont pas ce format.

## Index

`createDeckIndexes()` ajoute les index de la librairie :
`{visibility, gameId, favoritesCount}`, `{visibility, gameId, updatedAt}`,
`{visibility, legendCardId}`, `{visibility, format}`, `{visibility, domains}`.

## Migration

Aucune migration n'est requise : tous les champs sont optionnels et lus avec un
repli.

- Un deck d'avant la refonte n'a pas de `cards` : sa fiche affiche « Ce deck n'a
  pas encore de cartes », son `decklist` texte reste intact, et l'éditeur permet
  de le recoller dans l'onglet « Texte » pour le structurer.
- `favoritesCount` retombe sur la longueur de `favoritedBy` tant qu'il n'a pas
  été écrit ; il se corrige de lui-même au premier passage sur l'étoile.
- `domains` et `legendName` s'écrivent au premier enregistrement du contenu
  depuis l'éditeur. Tant qu'ils sont absents, le deck ne remonte pas dans les
  filtres par domaine ou par légende de la librairie.
- `version` s'incrémente à **chaque** enregistrement, contenu ou non. Elle ne
  comptait auparavant que les enregistrements de contenu, ce qui affichait
  « v2 — en cours » à côté d'une date de modification qui, elle, bougeait pour
  une description ou un guide.

## Points à reprendre

- **Résultats en tournoi** : la colonne de la page publique est en place mais
  n'a pas de source — il faudra pouvoir inscrire un deck à un tournoi.
- **Historique des versions** : `version` s'incrémente, mais les états
  antérieurs ne sont pas conservés ; le panneau « Versions » ne montre donc que
  la version courante.

## Visibilité : un défaut qui débordait

`deckSchema` pose `visibility: deckVisibilitySchema.default("private")` — le bon
défaut à la **création**. Le schéma de modification en dérivait par `.partial()`,
or `.partial()` rend un champ facultatif *en entrée* sans retirer son défaut *en
sortie* : tout `PATCH` qui ne mentionnait pas `visibility` repartait donc avec
`visibility: "private"`.

Autrement dit, renommer un deck public le dépubliait. Enregistrer son contenu,
ses notes ou son guide aussi. Le `refine` censé refuser un corps vide ne voyait
rien non plus, l'objet parsé n'étant jamais vide — il portait ce défaut, et un
`PATCH {}` passait en rendant le deck privé.

`deckUpdateSchema` retire donc explicitement le champ avant de le remettre en
facultatif. `deckSchema` garde le sien : à la création, un deck sans mention est
privé.

## Concurrence

Deux onglets ouverts sur le même deck s'écrasaient sans bruit : `version` était
incrémentée, jamais comparée.

`PATCH /decks/{deckId}` accepte désormais `expectedVersion` — la version que le
client croyait à jour. Elle entre dans le filtre de l'écriture : si le deck a
été enregistré entre-temps, rien ne s'applique et la réponse est un `409` de la
forme `{ error: "conflict", deck }`, où `deck` est l'état qui a devancé. Le
client se resynchronise donc sans second aller-retour.

Le champ est **facultatif** : sans lui, l'écriture reste « le dernier gagne ».
C'est ce qui permet aux clients qui n'ont pas encore été repris de continuer à
fonctionner.

Le motif est celui des échanges (`docs/TRADE.md`), où `revision` joue le même
rôle depuis plus longtemps — même filtre en compare-and-swap, même `409`, même
état frais joint au refus.
