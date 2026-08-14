# Prix des cartes

Les cartes portent un relevé de prix du marché de l'occasion, importé à la
main depuis Cardmarket. C'est un indicateur, pas une cotation : le relevé date
du dernier import, il ne vaut que pour l'édition anglaise, et toutes les cartes
n'en ont pas.

Pour l'instant, une seule place de marché (Cardmarket) et un seul jeu
(Flesh and Blood) sont branchés.

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
2. **Les cartes.** Un produit est rapproché des cartes de même nom, parmi les
   extensions reconnues derrière la sienne. En Flesh and Blood, le nom seul ne
   suffit pas : une carte existe en trois versions de pitch, qui sont trois
   cartes de numéros différents. Cardmarket les distingue par un suffixe de
   couleur (`Savage Swing (Red)`), la plateforme par l'attribut `pitch` : les
   deux sont traduits dans une même clé.

Cette correspondance est déduite du catalogue à chaque import — elle suit donc
les ajouts de Cardmarket sans entretien — et le script en publie le détail
(`--expansions`) pour qu'elle reste vérifiable.

**Ce qui n'est pas reconnu n'est pas deviné.** Un produit dont aucune carte ne
porte le nom, dont l'extension n'est pas reconnue, ou qui conviendrait aussi
bien à deux cartes (deux numéros de même nom dans une même extension) est
écarté : la carte reste sans prix, plutôt que de recevoir le prix d'une autre
impression.

En pratique, environ 70 % des cartes Flesh and Blood reçoivent un prix. Le
reste est surtout composé de promos, de jetons et de cartes de démonstration
que Cardmarket ne vend pas — un peu moins de 80 % des cartes de la plateforme
portent un nom que Cardmarket connaît.

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
   distingue deux cartes de même nom dans ce jeu. Sans particularité, un profil
   qui compare les noms normalisés suffit ; le profil Flesh and Blood sert de
   modèle pour un jeu qui, comme lui, écrit une variante entre parenthèses.

## Implémentation

- `lib/types/card-price.ts` : le relevé et ses valeurs.
- `lib/prices/cardmarket.ts` : les deux fichiers publics, leurs types et les
  identifiants de jeu.
- `lib/prices/cardmarket-matching.ts` : reconnaissance des extensions et des
  cartes, couverte par `cardmarket-matching.test.ts`.
- `lib/prices/cardmarket-prices.ts` : construction du relevé et choix du prix
  de référence, couverte par `cardmarket-prices.test.ts`.
- `lib/db/card-prices.ts` : écriture et lecture de `card-prices`, dont
  `getCardPricesByCardId` pour chiffrer une collection ou une liste de vente
  sans une requête par carte.
- `scripts/prices/import-cardmarket.ts` : l'import, lancé à la main.
