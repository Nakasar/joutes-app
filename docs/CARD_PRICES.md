# Prix des cartes

Les cartes portent un relevé de prix du marché de l'occasion, importé à la
main depuis Cardmarket. C'est un indicateur, pas une cotation : le relevé date
du dernier import, il ne vaut que pour l'édition anglaise, et toutes les cartes
n'en ont pas.

Pour l'instant, une seule place de marché (Cardmarket) et trois jeux :

| Jeu | Cartes cotées | Ce qui limite |
| --- | --- | --- |
| Riftbound | 1 153 / 1 219 (95 %) | quelques promos et jetons que Cardmarket ne vend pas |
| Flesh and Blood | 6 719 / 9 555 (70 %) | les promos, jetons et cartes de démonstration absents de Cardmarket |
| Star Wars Unlimited | ≈ 800 / 9 185 après réimport (9 %) | son catalogue énumère bien plus de variantes que Cardmarket n'en vend (ci-dessous) |

### Star Wars Unlimited : le nom anglais, et les identifiants partagés

Le catalogue est importé du site officiel en `locale=fr`
(`scripts/games/swu/import-cards.ts`) : les cartes ne portaient que leur nom
français, quand Cardmarket nomme ses produits en anglais — 243 cartes cotées
sur 7 112, celles dont le nom s'écrit pareil dans les deux langues.

L'import du catalogue rapporte donc aussi le nom anglais de chaque carte
(`englishName`), en relisant la même liste en `locale=en`. Une carte s'y
retrouve par son extension, son numéro **et son type de variante** : le site
officiel renumérote les variantes, si bien que « Je Suis Ton Père » est la 233
en standard et la 5 en hyperespace — numéro que porte aussi, en standard, Luke
Skywalker. C'est ce nom anglais que les prix comparent.

**Il faut donc réimporter le catalogue Star Wars Unlimited** pour que ses prix
suivent : les cartes déjà en base n'ont pas encore ce champ, et retombent d'ici
là sur leur nom français.

Le nom anglais lève le premier obstacle, pas le second : le catalogue officiel
énumère **3,5 variantes par carte** en moyenne (standard, standard foil,
hyperespace, showcase, et une cinquantaine de types promotionnels — « SS Judge »,
« GC Top 8 », « Prerelease Promo »…), quand Cardmarket en vend 1,6. Les nombres
ne correspondant pas, les variantes ne sont pas appariées et le groupe entier
est écarté : ≈ 800 cartes cotées après réimport, l'essentiel des produits
restant ambigus.

Pour aller plus loin, il faudrait garder le type de variante sur les cartes et
n'attribuer les prix qu'au tirage standard, les variantes promotionnelles
restant sans prix. C'est une décision à prendre, pas un réglage.

Cette renumérotation a une autre conséquence, celle-là indépendante des prix :
l'identifiant des cartes étant `<extension>-<numéro>`, `SOR-5` désigne à la fois
« Luke Skywalker, Faithful Friend » et « I Am Your Father » — 1 394 des 9 185
cartes du site officiel partagent ainsi leur identifiant avec une autre. Un
relevé étant écrit par identifiant, l'import des prix écarte ces cartes-là et le
dit dans son bilan : leur donner un prix reviendrait à écraser celui de l'autre.
Y remédier demande de changer le schéma d'identifiant des cartes SWU, ce qui
touche tout ce qui les référence (collections, listes de souhaits, de vente) —
c'est un chantier à part.

### Magic n'est pas branché

Deux raisons, et la première suffit : les cartes Magic ne sont pas dans
MongoDB — elles ne vivent que dans l'index de recherche — alors que l'import
des prix lit le catalogue en base. Et elles portent déjà `prices.eur` et
`prices.eur_foil`, que Scryfall tient de Cardmarket et rattache à l'impression
exacte : mieux que ce qu'un rapprochement par nom saurait retrouver.

## D'où viennent les prix

Cardmarket publie deux fichiers par jeu, en accès libre et sans compte, sur
[sa page de téléchargement](https://www.cardmarket.com/Data/Download) :

| Fichier | Contenu | Fréquence |
| --- | --- | --- |
| `productList/products_singles_<jeu>.json` | les cartes à l'unité : `idProduct`, nom, `idExpansion` | à chaque sortie |
| `priceGuide/price_guide_<jeu>.json` | pour chaque `idProduct` : prix bas, moyen, tendance, moyennes glissantes 1/7/30 jours, et les mêmes en foil | une fois par jour |

Ce sont les seules sources utilisées. Le site lui-même est derrière Cloudflare
et le refuse à un serveur, et l'API de Cardmarket demande un compte applicatif
qui n'est plus ouvert : ces deux fichiers sont ce que Cardmarket met à
disposition, et ils suffisent.

Les montants sont en euros.

## Ce qui est écrit en base

Un document par (jeu, carte, place de marché) dans la collection
`card-prices`, réécrit à chaque import — il n'y a pas d'historique.

```ts
type CardPrice = {
  cardId: string;            // « WTR020 », l'identifiant de la carte dans le jeu
  source: "cardmarket";
  currency: string;          // « EUR »
  prices: CardPriceValues;   // le prix de référence de la carte
  offers: CardPriceOffer[];  // chaque produit Cardmarket retenu, avec ses prix
  sourceUpdatedAt: string;   // date du fichier de Cardmarket
  updatedAt: string;         // date de l'import
};

type CardPriceValues = { low?, avg?, trend?, avg1?, avg7?, avg30? };
```

Une valeur absente n'est pas écrite : Cardmarket note `null` (ou `0` sur ses
colonnes de tendance) ce qu'il ne sait pas, et une carte ne vaut pas zéro euro.
Une carte dont aucun produit n'est coté n'a pas de document du tout.

### Prix de référence et `offers`

Une carte de l'application est un numéro de collection ; chez Cardmarket, un
même numéro est vendu comme plusieurs produits — le tirage normal, le rainbow
foil, le cold foil, la réédition Unlimited — et **rien dans ses fichiers ne dit
lequel est lequel**. Tous les produits reconnus sont donc conservés dans
`offers`, et `prices` reprend le moins cher d'entre eux : une version foil ne
vaut jamais moins que la carte dont elle est tirée, et une réédition vaut moins
que la première édition, donc le moins cher est le tirage de base. C'est un
prix « à partir de ».

Le moins cher se lit sur la tendance (`trend`), le prix lissé par Cardmarket.
Le prix bas ne dit que ce que demande une seule offre, parfois une carte
abîmée : il ne sert qu'à départager deux tendances égales. Un produit sans
tendance — Cardmarket ne sait pas le situer, faute de ventes — passe en
dernier, quel que soit son prix bas.

`offers` garde `productId` et `expansionId` : de quoi retrouver le produit chez
Cardmarket, et de quoi rattacher un jour les prix aux variantes d'impression
(cf. docs/CARD_PRINTINGS.md) si Cardmarket finit par les distinguer.

## Comment les cartes sont reconnues

Les deux catalogues n'ont aucun identifiant commun : le fichier de Cardmarket
ne donne d'une carte que son nom, sa catégorie et un numéro d'extension — ni
code d'extension, ni numéro de collection, et les extensions ne sont même pas
nommées. Le rapprochement se fait donc en deux temps.

1. **Les extensions.** Une extension Cardmarket et une extension de la
   plateforme qui partagent l'essentiel de leurs noms de cartes sont la même.
   Le recouvrement est mesuré dans les deux sens, sans quoi le deck de
   démarrage d'un héros « correspondrait » parfaitement à l'extension complète
   dont il est tiré. En dessous de 10 %, l'extension n'est pas reconnue : ce
   qu'elles ont en commun n'est qu'une poignée de promos. Plusieurs extensions
   Cardmarket peuvent désigner la même extension (première édition et
   Unlimited), et l'inverse est vrai aussi.
2. **Les cartes.** Les produits d'une extension qui portent le même nom sont
   confrontés d'un bloc aux cartes de même nom de l'extension reconnue. C'est
   leur nombre de part et d'autre qui dit ce qu'ils sont : une seule carte pour
   plusieurs produits, ce sont ses tirages (foil, réédition) et ils lui sont
   tous rattachés ; autant de cartes que de produits, ce sont ses variantes, et
   elles sont appariées (ci-dessous).

   Le nom ne suffit pas toujours : en Flesh and Blood, une carte existe en trois
   versions de pitch, qui sont trois cartes de numéros différents. Cardmarket
   les distingue par un suffixe de couleur (`Savage Swing (Red)`), la plateforme
   par l'attribut `pitch` : le profil du jeu traduit les deux dans une même clé.

Cette correspondance est déduite du catalogue à chaque import — elle suit donc
les ajouts de Cardmarket sans entretien — et le script en publie le détail
(`--expansions`) pour qu'elle reste vérifiable.

### Apparier les variantes

Une carte et sa version showcase portent le même nom des deux côtés : chez nous
deux numéros de collection (`OGN027` et `OGN027a`), chez Cardmarket deux
produits que rien ne distingue. Ils sont appariés **dans l'ordre** : Cardmarket
numérote ses produits dans l'ordre des numéros de collection.

Ce n'est pas une supposition : sur les cartes sans homonyme des extensions
principales — celles où les deux catalogues se recouvrent à plus de 70 % —
l'ordre se vérifie sur plus de 99 % des cartes (0 inversion sur les extensions
Riftbound OGN, SFD, UNL ; 1,1 % sur Flesh and Blood). En dessous de ce
recouvrement, l'extension Cardmarket n'est qu'un morceau de la nôtre, son ordre
ne suit plus le nôtre, et les variantes n'y sont pas appariées.

L'appariement demande autant de produits que de cartes : s'il en manque un,
tout le groupe est écarté plutôt que décalé d'un cran.

**Ce qui n'est pas reconnu n'est pas deviné.** Un produit dont aucune carte ne
porte le nom, dont l'extension n'est pas reconnue, ou qui conviendrait aussi
bien à deux cartes sans que leur nombre permette de les apparier est écarté :
la carte reste sans prix, plutôt que de recevoir le prix d'une autre impression.

Les cartes sans prix sont surtout des promos, des jetons et des cartes de
démonstration que Cardmarket ne vend pas : en Flesh and Blood, à peine 80 % des
cartes de la plateforme portent un nom que Cardmarket connaît, ce qui borne le
reste.

## Où les prix s'affichent

Partout où une carte porte un nom, le prix se range à côté, en petit
(`CardPriceTag`) : galerie de cartes (en grille comme en liste), grille de
collection — personnelle ou de groupe —, et contenu d'un booster. Une carte
sans relevé n'affiche rien du tout : un tiret se lirait comme un prix nul.

La fiche d'une carte en montre davantage (`CardPriceDetails`) : le prix de
référence, les valeurs qui l'entourent (prix bas, tendance, moyenne 30 jours),
la date du relevé et le nombre de tirages retenus. C'est le seul écran où la
place manque assez peu pour dire d'où vient le chiffre.

Les prix voyagent avec les cartes, jamais dans une requête à part : la
recherche (`/api/games/<jeu>/cards`), la collection (`getGameCollection`) et le
contenu d'un booster (`withCardAttributes`) les rattachent aux cartes qu'ils
renvoient déjà. Une carte de l'index de recherche est retrouvée par son
`cardId` — l'index épure l'identifiant, le relevé porte le vrai.

### Lien vers Cardmarket

Un prix renvoie à la fiche du produit d'où il vient :
`https://www.cardmarket.com/en/<Jeu>/Products?idProduct=<id>`. Cardmarket
redirige cette forme vers la bonne page à partir de l'identifiant de son
catalogue public — celui que portent nos relevés — et c'est la forme que
Scryfall publie dans ses `purchase_uris`. Le segment de jeu ne se devine pas
(`fab` s'y écrit `FleshAndBlood`) : il vient de `CARDMARKET_GAME_PATHS`, et un
jeu absent de cette table n'a pas de lien plutôt qu'un lien mort.

Le lien mène au **tirage retenu comme prix de référence**, pas à un autre
tirage de la même carte.

Il n'apparaît que là où le prix n'est pas déjà à l'intérieur d'un lien ou d'un
bouton : fiche de carte, contenu d'un booster, interface d'échange. Dans la
galerie et dans la collection, la tuile entière est cliquable et une ancre
imbriquée dans une autre n'est pas du HTML valide — la fiche de la carte, à un
clic, porte le lien.

### Valeur d'un booster

L'éditeur de booster affiche la somme des prix de ses cartes. Elle se recalcule
toute seule à chaque carte ajoutée ou retirée — le recalcul est fait par
`addCardToBooster` et `removeCardFromBooster`, donc la valeur suit le contenu
quel que soit l'appelant — et le bouton **Recalculer le prix**
(`POST /api/collection/boosters/<id>/value`) sert à rattraper un import de prix
survenu depuis. Le foil, lui, ne la change pas : les prix sont relevés par carte
du catalogue, sans distinguer les tirages.

Le résultat est écrit sur le booster (`estimatedValue`) plutôt que recalculé à
chaque affichage : c'est un relevé daté, comparable d'un booster à l'autre, et
non un chiffre qui bouge tout seul au gré des imports.

La valeur dit aussi sur combien de cartes elle repose : les cartes sans prix ne
sont pas estimées, et un total porté par trois cartes sur douze ne se lit pas
comme le prix du booster.

### Chiffrer un échange

L'interface d'échange chiffre les deux offres et affiche leur écart. Chaque
carte y vaut le prix que son propriétaire a décidé, à défaut son prix de marché
(`lib/trade/pricing.ts`) :

- le prix décidé se saisit sur la carte, dans sa propre offre — celle d'en face
  appartient au partenaire, qui fixe la sienne ;
- le champ vide ou le bouton de remise à zéro rendent la main au prix de
  marché ; un prix à zéro, lui, en est un — une carte offerte se décide ;
- le prix négocié est enregistré sur l'offre (`unitPrice` sur la carte de
  l'échange), donc visible des deux côtés, et le modifier annule les
  validations en cours, comme toute modification d'une offre.

**Ce qui n'a pas de prix ne vaut pas zéro** : ces cartes restent hors du total,
et l'écran dit combien d'exemplaires sont dans ce cas. Sans quoi deux offres se
compareraient sur des bases différentes sans que rien ne le signale.

## Lancer un import

Depuis la racine du dépôt :

```sh
node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/prices/import-cardmarket.ts --game fab
```

- `--game <slug>` : le jeu à traiter (`fab` par défaut) ;
- `--dry-run` : rapproche et affiche le bilan sans rien écrire ;
- `--expansions` : détaille les extensions reconnues, une par ligne.

Le script affiche à chaque fois combien de cartes ont été rapprochées, combien
de produits ont été écartés et pourquoi, et les extensions les moins couvertes.
Il est rejouable : deux imports de suite réécrivent les mêmes documents.

Seule `MONGODB_URI` est nécessaire — les fichiers de Cardmarket ne demandent
aucune authentification.

## Ajouter un jeu

1. `CARDMARKET_GAME_IDS` (`lib/prices/cardmarket.ts`) : l'identifiant du jeu
   chez Cardmarket. Il se vérifie en ouvrant
   `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_<id>.json`,
   dont les premières lignes nomment le jeu (`categoryName`). Les identifiants
   connus : Magic 1, Yu-Gi-Oh 3, Pokémon 6, Flesh and Blood 16, One Piece 18,
   Lorcana 19, Star Wars Unlimited 21, Riftbound 22.
2. `CARDMARKET_GAME_PROFILES` (`lib/prices/cardmarket-matching.ts`) : ce qui
   distingue deux cartes de même nom dans ce jeu. `NAME_ONLY_PROFILE` suffit
   quand le nom complet identifie la carte dans son extension — c'est le cas de
   Riftbound, dont les cartes portent déjà leur sous-titre
   (`Ahri, Alluring`) comme Cardmarket. Le profil Flesh and Blood sert de modèle
   pour un jeu qui, comme lui, écrit une variante entre parenthèses ; celui de
   Star Wars Unlimited, pour un jeu dont le catalogue n'est pas en anglais.

   Le jeu doit aussi avoir ses cartes dans MongoDB : c'est de là que le script
   lit le catalogue. Magic fait exception (voir plus haut).

## Implémentation

- `lib/types/card-price.ts` : le relevé et ses valeurs.
- `lib/prices/cardmarket.ts` : les deux fichiers publics, leurs types et les
  identifiants de jeu.
- `lib/prices/cardmarket-matching.ts` : reconnaissance des extensions et des
  cartes, couverte par `cardmarket-matching.test.ts`.
- `lib/prices/cardmarket-prices.ts` : construction du relevé et choix du prix
  de référence, couverte par `cardmarket-prices.test.ts`.
- `lib/db/card-prices.ts` : écriture et lecture de `card-prices`, dont
  `getCardMarketPrices` et `withMarketPrices`, qui rattachent leur prix à un lot
  de cartes sans une requête par carte.
- `lib/prices/display.ts` : le montant qui représente une carte, la somme d'un
  lot et leur mise en forme, couverts par `display.test.ts`.
- `components/cards/CardPriceTag.tsx` et `CardPriceDetails.tsx` : l'affichage,
  partagé par tous les écrans qui listent des cartes.
- `lib/prices/cardmarket.ts` : `cardmarketProductUrl` et les segments de jeu.
- `lib/trade/pricing.ts` : prix appliqué, total d'une face et écart entre les
  deux, couverts par `pricing.test.ts`.
- `lib/db/boosters.ts` : `computeBoosterValue`, derrière
  `app/api/collection/boosters/[boosterId]/value`.
- `scripts/prices/import-cardmarket.ts` : l'import, lancé à la main.
