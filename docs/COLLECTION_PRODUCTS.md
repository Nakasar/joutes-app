# Collection de produits — jeux de figurines

Ouverture de la collection aux jeux qui ne se jouent pas avec des cartes. Un
joueur de figurines ne collectionne pas des numéros de collection : il achète
des **produits** — boîtes, blisters, coffrets — dont certains **en contiennent
d'autres**, et ce qu'il suit vraiment, c'est sa gamme de figurines.

Le chemin des cartes n'est pas forké : deux collections Mongo neuves s'ajoutent
à côté, et `lib/db/collection.ts` ne change qu'en un point.

## Principes

- **Le contenu fait le contenant, pas le type.** `kind` (boîte, figurine,
  accessoire…) n'est qu'une facette d'affichage et de filtre. Ce qui décide
  qu'un produit en contient d'autres, c'est `contents` — sinon une boîte dont
  le contenu n'est pas encore saisi se comporterait comme un contenant vide, et
  un blister de trois figurines comme une figurine seule.
- **Un seul niveau d'imbrication.** Un produit qui a un contenu ne peut pas
  figurer dans le contenu d'un autre. Une boîte d'armée contient des figurines,
  pas des boîtes.
- **Ajouter une boîte ajoute ses figurines**, chacune sachant de quelle boîte
  elle est sortie. Retirer la boîte retire ce qu'elle a apporté ; une figurine
  détachée y survit.
- **La complétude se compte en références**, pas en unités.

## Le catalogue — `products`

| Champ | Rôle |
| --- | --- |
| `gameId` | Jeu propriétaire du catalogue |
| `id` | Identifiant **unique par jeu**, figé après création |
| `name`, `kind`, `image` | Identité et présentation |
| `setCode` | Gamme ou vague — l'équivalent du `setCode` d'une carte |
| `contents` | `[{ productId, quantity }]` ; absent = produit feuille |
| `attributes` | Attributs propres au jeu (faction, socle, points…) |

Deux différences avec `cards`, l'une et l'autre délibérées :

- **`id` est unique par jeu**, garanti par un index. `cards.id` ne l'est pas (le
  catalogue porte une ligne par langue), ce qui oblige toutes les agrégations de
  `lib/db/collection.ts` à un `$arrayElemAt` défensif. On ne reproduit pas ce
  défaut.
- **`attributes` est imbriqué**, là où ceux d'une carte sont écrits à la racine
  du document. Sur un catalogue neuf, plus de liste de champs réservés à
  défendre, et leur relevé se réduit à un `$objectToArray: "$attributes"`.

**L'identifiant est figé après création.** Il est référencé par les exemplaires
en collection *et* par le contenu des autres produits : le renommer demanderait
une cascade sur deux collections. Le formulaire le verrouille en édition, et
l'action serveur ignore celui qu'on lui passe.

### Composition

`lib/products/contents.ts` tranche, sans toucher à la base :

| Cas | Résultat |
| --- | --- |
| Le produit se cite lui-même | refusé |
| Une référence n'existe pas dans ce jeu | refusée, l'identifiant est rendu tel quel |
| La référence a elle-même un contenu | refusée, en la nommant |
| Le produit édité gagne un contenu alors qu'il est déjà cité ailleurs | refusé |
| Le même identifiant figure deux fois | fusionné, quantités additionnées |

Les messages **nomment le produit fautif** : coller une liste et lire « données
invalides » ne dit pas quoi corriger.

## La possession — `collection-products`

**Un document par exemplaire physique**, comme `collection-cards` : pas de champ
quantité, le nombre d'exemplaires est un `count()`. Propriétaire `userId` **ou**
`playGroupId`, jamais les deux.

Deux champs portent la particularité du modèle :

- **`gameId` est écrit sur l'exemplaire.** `collection-cards` ne le porte pas :
  le jeu n'y est atteignable que par jointure vers `cards`, si bien que la vue
  d'ensemble énumère les jeux depuis le catalogue de cartes. Sans ce champ, un
  jeu de figurines — qui n'a aucune carte — n'apparaîtrait jamais dans
  `/collection`.
- **`fromProductEntryId` désigne un exemplaire**, pas un produit du catalogue.
  Différence avec le `fromBoosterId` des boosters, qui vise un objet personnel :
  `products` est un catalogue partagé. Deux boîtes identiques restent deux
  objets distincts, et chaque figurine sait de laquelle elle est sortie.

### Attributs par exemplaire

`paintState` est une **échelle ordonnée** — non montée, montée, sous-couchée, en
cours, peinte, socle terminé — et non plusieurs booléens : une figurine progresse
de façon monotone, et un axe unique donne une statistique lisible. `sealed`
marque un produit encore sous blister ; il n'est écrit que lorsqu'il vaut `true`,
comme le `foil` d'une carte. `obtainedAt`, `acquisitionPrice` et
`acquisitionCurrency` sont ceux des cartes, réutilisés tels quels.

## Ajouter une boîte

1. L'exemplaire de boîte est inséré.
2. Une entrée est insérée **par unité** du contenu retenu, portant
   `fromProductEntryId`.

**L'ordre compte.** Aucune session Mongo n'est ouverte — le dépôt n'en utilise
nulle part, et le replica set n'est pas garanti. Un incident entre les deux
écritures laisse donc une boîte sans contenu, que l'interface sait montrer et
réparer. L'ordre inverse laisserait des figurines orphelines, impossibles à
rattacher.

**Ce qui s'hérite, et ce qui ne s'hérite pas :**

| Attribut | Hérité ? | Pourquoi |
| --- | --- | --- |
| `obtainedAt` | oui | tout est entré dans la collection le même jour |
| `sealed` | oui | une boîte scellée n'a pas de figurines montées |
| `paintState` | oui, « non montée » par défaut | elles sortent de la boîte |
| `acquisitionPrice` | **non** | recopier le prix de la boîte sur chacune de ses figurines doublerait la valeur de la collection |

L'utilisateur peut **décocher** une partie du contenu à l'ajout : une boîte
d'occasion arrive rarement complète.

### Retirer, détacher

- **Retirer un exemplaire de conteneur** retire ce qu'il a apporté et qui y est
  encore rattaché, en un seul `deleteMany`. Le bouton annonce le nombre avant
  confirmation.
- **Détacher** (`PATCH { detach: true }`) retire `fromProductEntryId` : « je l'ai
  sortie de la boîte », elle survivra à son retrait. **À sens unique** — il
  n'existe pas de rattachement, la provenance décrit d'où une figurine est
  sortie, pas où elle est rangée.
- **Desceller un conteneur** descelle ce qu'il a apporté et qui l'était encore :
  « j'ai ouvert la boîte » vaut pour tout ce qu'elle contenait.

## Les deux complétudes

Elles sont distinctes, toutes deux utiles, et portent des noms différents.

| | Portée | Question |
| --- | --- | --- |
| `contentCompletion` | un produit du **catalogue**, toutes provenances confondues | « ai-je déjà tout ce qu'il y a dedans ? » |
| `boxCompletion` | un **exemplaire** possédé | « rien n'est sorti de cette boîte-là ? » |

La première a un sens **même pour une boîte qu'on ne possède pas** — inutile de
l'acheter, j'ai déjà tout dedans — et c'est elle que porte la grille. La seconde
n'apparaît que sur la fiche d'un exemplaire.

Les deux se comptent en **références** : une boîte de huit figurines dont deux
sont jumelles affiche « 7/7 ». Compter les unités ferait dépendre l'indicateur du
nombre d'exemplaires, ce qu'aucun joueur ne lit ainsi.

## Complétion d'un jeu

« Master Set » et « Game Set » ne veulent rien dire pour une gamme de figurines.
Trois axes les remplacent :

| Axe | Numérateur / dénominateur |
| --- | --- |
| **Catalogue** | produits distincts possédés / produits du jeu |
| **Figurines** | produits **feuilles** distincts possédés / total |
| **Peinture** | exemplaires peints ou terminés / exemplaires de produits feuilles |

C'est le deuxième qui compte pour un joueur : les boîtes sont un moyen, la gamme
est la fin. Seules les feuilles entrent au dénominateur de la peinture — une
boîte y plafonnerait le taux sous les 100 %, pour toujours.

`ProductCollectionStats` est un type **parallèle** à `GameCollectionStats`, et
non un champ optionnel de celui-ci : ce dernier est lu par les écrans de
collection, ceux des groupes de jeu, l'application mobile et `openapi.yaml`, et
tous ses champs parlent de cartes. La fusion par jeu se fait dans la vue.

Pour la même raison, **`CollectionOverview.totalCopies` garde son sens** — les
exemplaires de cartes. Les produits ont leurs propres champs
(`productGames`, `totalProductCopies`, `productsOwned`, `productsTotal`).

**Les trois axes ne comptent qu'une édition à la fois** — celle en cours du jeu,
sauf demande contraire. Une gamme qui change d'édition ne se collectionne pas en
repartant de zéro : compter la première avec la seconde ferait tomber la
complétion d'un joueur à jour sans qu'il ait rien perdu, et le catalogue d'un jeu
qui en compte trois ne serait plus complétable par personne.

Le périmètre est un paramètre de `getProductGamesStats`, pas une chaîne :

| Périmètre | Ce qui est compté | Qui le demande |
| --- | --- | --- |
| `current` (défaut) | l'édition en cours de **chaque** jeu | la vue d'ensemble, qui calcule pour tous les jeux d'un coup |
| `edition` | une édition nommée | l'écran de collection, qui suit son sélecteur |
| `all` | tout le catalogue | le même écran, sur « toutes les éditions » |

Ce troisième cas est ce qui interdisait de se contenter d'une édition résolue :
la vue d'ensemble n'a pas d'écran où choisir, et chaque jeu y a la sienne. Le
relevé se fait donc en une requête, avec un `$or` par jeu plutôt qu'un `$in`.

Les statistiques rendues portent l'édition qu'elles couvrent
(`ProductCollectionStats.edition`, absente pour « toutes ») : une complétion qui
ne compte qu'une partie du catalogue doit dire laquelle, sur le site comme dans
l'application mobile.

## À l'écran

Trois états se lisent sur une tuile, et ils ne disent pas la même chose :

| État | Rendu |
| --- | --- |
| Possédé | anneau émeraude, pastille `×n` — comme une carte |
| Non possédé | visuel atténué et désaturé |
| Contenu partiel | pastille « 5/8 » |
| Contenu complet | pastille émeraude « 8/8 » |
| **Contenu complet sans posséder le produit** | **anneau ambre** |

L'anneau ambre est le seul indicateur qui change une décision d'achat ; il ne
s'allume donc que là, jamais sur une boîte déjà possédée.

L'image d'un produit est **carrée**, quand celle d'une carte est en 3/4 : la
différence de gabarit dit à elle seule qu'on ne regarde pas des cartes.

Le choix « j'ai la boîte » ou « j'ai juste cette figurine » ne pose jamais de
question : il se joue à l'endroit du clic. Ajouter depuis l'en-tête ajoute le
produit, avec la case « ajouter aussi le contenu » cochée d'avance et chiffrée ;
ajouter depuis une ligne du contenu n'ajoute que cette figurine.

## Chercher et filtrer

Le catalogue se parcourt **comme la galerie de cartes** : une colonne de filtres
à demeure sur la gauche, et une barre de recherche qui accepte la même syntaxe
(`faction:Rebelles points<=8 commando`). Ce n'est pas une ressemblance de façade
— c'est le même code : `CardSearchInput`, `CardFacetFilters` et
`parseSearchSyntax` servent les deux écrans. Deux choses seulement diffèrent, et
elles tiennent dans `lib/products/search.ts` :

| | Cartes | Produits |
| --- | --- | --- |
| Vocabulaire commun | `set`, `type`, `lang` | `set`, `kind` |
| Traduction des critères | expression Meilisearch | filtre Mongo sur `attributes.<clé>` |

**Les facettes sont relevées, jamais déclarées.** `getGameProductFacets` compte
les attributs que les produits d'un jeu portent vraiment : plage min–max pour
ceux qui sont numériques, liste de valeurs pour les autres. Aucun jeu n'est
nommé dans le code — Legion obtient une facette `faction` parce que son import
en pose une, et en obtiendrait une de plus le jour où un administrateur saisit
des points.

Trois familles restent dehors, faute d'un contrôle qui les servirait :
l'**édition**, qui a son propre sélecteur et décide en plus du périmètre des
statistiques ; les **booléens**, qu'une pastille à cocher rendrait ambigus ; les
attributs à plus de quarante valeurs distinctes ou à une seule — un filtre qui ne
retire jamais rien n'en est pas un.

**Rien n'est construit à partir de ce que l'appelant envoie.** Une clé qui n'est
pas une facette du jeu et une valeur que la facette ne déclare pas sont écartées,
par `parseCardSearchCriteria` puis à nouveau par `productFacetMatch` : les
critères d'un agent ne décident pas de ce sur quoi on interroge la base.

**La saisie est relue côté serveur**, comme pour les cartes : un rendu serveur et
un appel d'API filtrent donc comme l'écran, sans que le navigateur ait à traduire
quoi que ce soit. Un token l'emporte sur la liste déroulante correspondante —
`set:LEG` filtre la gamme même si la liste dit « toutes » —, tandis que les
critères d'attributs de la colonne et de la saisie se cumulent.

**Les deux routes de catalogue lisent la même fonction.** `getProductCollection`
prend un propriétaire `null` pour le catalogue public : il n'y a alors ni
possession ni statistiques, mais filtres, éditions et syntaxe se comportent à
l'identique — une correction sur l'un profite à l'autre.

## Activer un jeu

1. Cocher **Produits** dans les fonctionnalités du jeu, depuis `/admin/games`.
2. Créer les index : `npx tsx scripts/create-product-indexes.ts`. **À faire avant
   tout import** — l'unicité de `{gameId, id}` est ce qui évite de reproduire le
   défaut de `cards.id`.
3. Saisir le catalogue depuis `/admin/products`, figurines d'abord, boîtes
   ensuite : une boîte ne peut référencer que des produits déjà créés.

### Importer un catalogue

Quand la gamme est publiée quelque part, un script vaut mieux qu'une saisie :

```bash
node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/games/shatterpoint/import-products.ts --dry-run
```

| Jeu | Script | Source |
| --- | --- | --- |
| Star Wars: Shatterpoint | `scripts/games/shatterpoint/import-products.ts` | l'API de shatterpoint-miniatures.eu |
| Star Wars: Legion | `scripts/games/legion/import-products.ts` | les pages galerie et notices de montage d'atomicmassgames.com |

Chacun ne fait que **bâtir sa liste de produits** ; le reste — recopie des
images, protection de la saisie manuelle, écriture, bilan — vit une seule fois
dans `scripts/games/product-import.ts`. Un troisième jeu n'a que sa source à
écrire.

Trois points rendent un import rejouable, et valent pour tous :

- **Les images sont recopiées sur Vercel Blob.** `next.config.ts` n'autorise
  `next/image` qu'à charger depuis ce domaine ; un lien vers le site source ne
  s'afficherait pas. Le chemin de destination est déterministe, si bien qu'une
  seconde exécution n'envoie rien.
- **`attributes` n'est jamais remplacé en bloc.** Chaque attribut connu de la
  source est écrit sous sa propre clé (`attributes.faction`), si bien que ce
  qu'un administrateur a saisi à côté — points, mission, ce que la source ignore
  — survit aux imports suivants.
- **Les produits retouchés à la main sont épargnés** — ceux qui portent un
  `manuallyEditedAt` — sauf `--force`. L'import corrige le reste : c'est ainsi
  que « Yub Nub », saisi en figurine, redevient une boîte.

### Les factions de Legion

La galerie d'AMG range chaque produit sous une ou plusieurs factions, et
l'import les pose en attribut `faction` — d'où la facette qui apparaît dans la
colonne de filtres, et le `faction:"Rebel Alliance"` que la barre de recherche
accepte.

**Les libellés sont lus sur la page**, en regard des classes du thème (« Star
Wars: Legion Rebel Alliance » pour `star-wars-legion-rebel-alliance`), et non
inscrits dans le script : Legion a gagné deux factions depuis sa sortie, la
prochaine entrera au catalogue sans qu'on touche au code.

**La valeur est toujours une liste**, même à une seule faction — un paquet de
cartes en couvre six, et une clé tantôt chaîne tantôt tableau se filtrerait mal
et se saisirait plus mal encore.

**Seule la galerie classe par faction** : les produits qui n'y sont plus — l'ère
FFG pour l'essentiel, mais aussi des références AMG épuisées — n'en portent
aucune, 89 sur 152 aujourd'hui. Le bilan de fin d'exécution les compte, et une
faction saisie à la main survit aux imports suivants.

## Les éditions

Certaines gammes traversent plusieurs **éditions** — des versions du jeu qui ne
sont pas toujours compatibles. Star Wars: Legion en compte deux : une boîte de la
première ne se joue pas avec les règles de la seconde, et un joueur a besoin de
le savoir avant d'acheter.

| | Où | Quoi |
| --- | --- | --- |
| L'édition d'un produit | attribut `edition` | une valeur libre, saisie ou posée par un import |
| L'édition **en cours** | `games.currentProductEdition` | réglée depuis `/admin/products` |

**L'édition est un attribut, pas un champ.** La plupart des jeux n'en ont pas :
un champ de plus sur tous les produits de la plateforme pour deux gammes serait
mal placé. En attribut, elle hérite sans une ligne de la saisie, du relevé et de
l'autocomplétion de `/admin/products` — et une correction manuelle survit aux
imports suivants, qui n'écrivent que les attributs qu'ils connaissent, chacun
sous sa propre clé.

**Un produit sans édition n'appartient à aucune.** Il ne ressort d'aucun filtre
d'édition, seulement de « toutes ». C'est ce qui donne son sens au réglage —
« dernière édition » veut dire ce qu'il dit —, et c'est aussi le piège : une
gamme mal étiquetée disparaît des écrans. L'administration affiche donc, sous le
réglage, combien de produits portent quelle édition et combien n'en portent
aucune, avec ce que le choix rendra visible.

**Le défaut est posé côté serveur**, dans les deux routes de catalogue, et non
dans chaque écran : le site, l'application mobile et les agents lisent les mêmes
routes, et « par défaut, la dernière édition » doit valoir pour tous. Un client
qui veut tout le catalogue le demande, avec `edition=all`.

Sur une tuile, l'édition ne s'affiche **que lorsqu'elle n'est pas celle en
cours** : c'est l'exception qu'il faut signaler, pas la règle.

**Un catalogue sans contenu reste un catalogue.** Shatterpoint publie l'unité par
unité ce que contient chaque boîte, Legion non — Atomic Mass Games n'en dit rien
d'exploitable. L'import Legion écrit donc 152 feuilles, sans une seule ligne de
`contents`, et c'est déjà ce qu'il faut pour suivre une collection. Le contenu
n'est pas un préalable : il pourra s'ajouter plus tard sans toucher aux
identifiants, qui eux sont figés.

## Ce qui n'est pas branché

Les produits ne sont **pas** dans les wishlists, les listes de vente ni les
échanges. Ces trois fonctionnalités référencent des `_id` de `collection-cards`
et supposent partout un document de forme carte
(`cardId`/`setCode`/`collectorNumber`). L'absence est un choix, pas un oubli.

La collection partagée d'un groupe de jeu n'expose pas encore de routes pour les
produits, mais tout le module d'accès prend déjà un `CollectionOwner` : ce ne
sera qu'un ajout de routes.

La recherche de produits est un motif Mongo insensible aux accents
(`productSearchFilter`), sans index Meilisearch — `lib/meilisearch.ts` est une
table de slugs en dur, réservée aux cartes. Le texte libre ne cherche donc que le
nom et l'identifiant : les filtres d'attributs, eux, sont des conditions Mongo et
n'en dépendent pas.

Les critères de filtre ne sont pas repris dans l'URL comme ceux de la galerie de
cartes : un catalogue de produits se partage encore par son adresse de jeu, pas
par sa recherche.
