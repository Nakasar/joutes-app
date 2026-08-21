# Prix des cartes

Les cartes portent un relevé de prix du marché de l'occasion, importé à la
main depuis Cardmarket ou CardNexus. C'est un indicateur, pas une cotation : le
relevé date du dernier import, il ne vaut que pour l'édition anglaise, et
toutes les cartes n'en ont pas.

## Deux fournisseurs, un relevé par carte

Chaque fournisseur a son import, écrit ses propres relevés et ne touche pas à
ceux de l'autre. Une carte peut donc en porter deux ; l'écran n'en montre qu'un,
et c'est **CardNexus qui passe devant, carte par carte** (`CARD_PRICE_SOURCES`,
`lib/types/card-price.ts`) : là où il ne dit rien, Cardmarket reprend la main.

|  | Cardmarket | CardNexus |
| --- | --- | --- |
| Accès | fichiers publics, sans compte | clé d'API (`CARDNEXUS_API_KEY`) |
| Rapprochement | par **nom** de carte, avec seuils et appariements | par **extension et numéro de collection** |
| Tirages | plusieurs produits que rien ne distingue | un produit, ses tirages cotés à part (`Standard`, `Foil`…) |
| Devise | euros | euros (voir plus bas) |

L'ordre n'est pas un jugement de valeur sur les prix eux-mêmes : le catalogue de
CardNexus **nomme l'extension et le numéro** de chaque produit, si bien que ses
prix se rattachent à la bonne carte par identité, quand ceux de Cardmarket le
sont par une ressemblance de noms qui, elle, peut se tromper de carte. Un prix
sûrement attribué vaut mieux qu'un prix peut-être mieux coté.

Le choix se fait carte par carte, et non jeu par jeu : un jeu que CardNexus ne
couvre qu'à moitié garde les prix Cardmarket sur le reste, plutôt que de perdre
la moitié de ses cotes. Un relevé qui ne porte aucun montant ne compte pas comme
une réponse et laisse la place au suivant.

## Ce que ça couvre

Les chiffres ci-dessous sont ceux du seul import Cardmarket, le premier écrit :

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
MongoDB — elles ne vivent que dans l'index de recherche — alors que les imports
de prix, l'un comme l'autre, lisent le catalogue en base. Et elles portent déjà
`prices.eur` et `prices.eur_foil`, que Scryfall tient de Cardmarket et rattache
à l'impression exacte — jusqu'au numéro et au tirage, ce qu'aucun de nos deux
relevés ne fait.

Les deux places de marché vendent pourtant Magic, et CardNexus rattache même ses
produits à leur `scryfallId` : le jour où les cartes Magic seront en base, c'est
par là qu'il faudra commencer.

## D'où viennent les prix

### Cardmarket

Cardmarket publie deux fichiers par jeu, en accès libre et sans compte, sur
[sa page de téléchargement](https://www.cardmarket.com/Data/Download) :

| Fichier | Contenu | Fréquence |
| --- | --- | --- |
| `productList/products_singles_<jeu>.json` | les cartes à l'unité : `idProduct`, nom, `idExpansion` | à chaque sortie |
| `priceGuide/price_guide_<jeu>.json` | pour chaque `idProduct` : prix bas, moyen, tendance, moyennes glissantes 1/7/30 jours, et les mêmes en foil | une fois par jour |

Ce sont les seules sources utilisées chez lui. Le site lui-même est derrière
Cloudflare et le refuse à un serveur, et l'API de Cardmarket demande un compte
applicatif qui n'est plus ouvert : ces deux fichiers sont ce que Cardmarket met
à disposition, et ils suffisent.

Les montants sont en euros.

### CardNexus

CardNexus publie trois « feeds » par jeu, sous clé d'API
([documentation](https://docs.cardnexus.com/feeds)) :

| Feed | Contenu | Reconstruit quand |
| --- | --- | --- |
| `expansions` | les extensions du jeu : identifiant, nom, **code d'éditeur** | le catalogue change |
| `catalog` | les produits : identifiant, nom, extension, **numéro de collection**, variante, tirages | le catalogue change |
| `prices` | pour chaque produit et chaque tirage : les prix Cardmarket, TCGplayer et CardNexus | les prix sont rafraîchis |

Chaque feed se télécharge en deux temps : l'API rend des métadonnées portant un
lien signé à durée limitée, puis le lien rend un fichier NDJSON gzippé, une ligne
par produit. Les fichiers sont lus **ligne à ligne** et jamais chargés d'un
bloc — le catalogue d'un gros jeu compte des dizaines de milliers de produits.

Deux dates accompagnent un feed : `generatedAt` n'avance que si le contenu
change, `lastRefreshedAt` à chaque reconstruction, même à l'identique. C'est
`generatedAt` qui date nos relevés.

La clé (`CARDNEXUS_API_KEY`, préfixée `cnk_live_`) se crée sur cardnexus.com,
dans *Settings → API keys* ; les feeds n'exigent aucune portée particulière.
**Seul l'import s'en sert** : le site, lui, ne parle jamais à CardNexus, il lit
les relevés déjà écrits.

#### Quelles valeurs sont retenues

CardNexus cote chaque tirage jusqu'à trois fois : l'instantané quotidien de
Cardmarket (en euros), celui de TCGplayer (en dollars) et les annonces vivant sur
sa propre place de marché (converties en euros). Un relevé ne portant qu'une
devise et l'application comptant en euros :

1. l'instantané Cardmarket est retenu en premier — c'est le plus complet, et le
   seul à porter un prix agrégé ;
2. à défaut, l'annonce la moins chère de la place de marché CardNexus ;
3. TCGplayer est laissé de côté : convertir des dollars reviendrait à inventer
   un prix que personne n'affiche.

Les trois valeurs se rangent dans les nôtres : le prix agrégé — celui que
CardNexus montre comme prix de la carte — devient la tendance, le prix médian
tient lieu de moyenne, le prix bas reste le prix bas. Le prix haut et les
variations sur 24 h, 7 et 30 jours ne sont pas conservés : rien ne les affiche.

## Ce qui est écrit en base

Un document par (jeu, carte, place de marché) dans la collection
`card-prices`, réécrit à chaque import — il n'y a pas d'historique.

```ts
type CardPrice = {
  cardId: string;            // « WTR020 », l'identifiant de la carte dans le jeu
  source: "cardnexus" | "cardmarket";
  currency: string;          // « EUR »
  prices: CardPriceValues;   // le prix de référence de la carte
  offers: CardPriceOffer[];  // chaque tirage retenu, avec ses prix
  sourceUpdatedAt: string;   // date du fichier de la place de marché
  updatedAt: string;         // date de l'import
};

type CardPriceValues = { low?, avg?, trend?, avg1?, avg7?, avg30? };
```

Une valeur absente n'est pas écrite : une place de marché note `null` (ou `0`
sur ses colonnes de tendance) ce qu'elle ne sait pas, et une carte ne vaut pas
zéro euro. Une carte dont aucun produit n'est coté n'a pas de document du tout.

C'est `source` qui rend les deux fournisseurs indépendants : l'unicité porte sur
`{gameId, cardId, source}`, si bien qu'un import réécrit ses propres relevés sans
jamais effacer ceux de l'autre.

### Prix de référence et `offers`

Une carte de l'application est un numéro de collection ; une place de marché en
vend plusieurs tirages. Tous ceux qui sont reconnus sont conservés dans
`offers`, et `prices` reprend **le moins cher** d'entre eux : une version foil
ne vaut jamais moins que la carte dont elle est tirée, et une réédition vaut
moins que la première édition, donc le moins cher est le tirage de base. C'est
un prix « à partir de ».

Le moins cher se lit sur la tendance (`trend`), le prix lissé par la place de
marché. Le prix bas ne dit que ce que demande une seule offre, parfois une carte
abîmée : il ne sert qu'à départager deux tendances égales. Un produit sans
tendance — la place de marché ne sait pas le situer, faute de ventes — passe en
dernier, quel que soit son prix bas. Ce choix est le même pour les deux
fournisseurs (`lib/prices/offers.ts`).

Ce qu'une offre représente, en revanche, diffère :

- **Cardmarket** vend un même numéro comme plusieurs produits — tirage normal,
  rainbow foil, cold foil, réédition Unlimited — et **rien dans ses fichiers ne
  dit lequel est lequel**. Une offre est donc un produit, sans plus de précision.
- **CardNexus** garde un seul produit et cote chacun de ses tirages à part. Une
  offre est donc un tirage : elle porte son nom (`finish`), et deux offres d'une
  même carte peuvent partager leur `productId`.

`offers` garde `productId` et `expansionId` : de quoi retrouver le produit chez
la place de marché, et de quoi rattacher un jour les prix aux variantes
d'impression (cf. docs/CARD_PRINTINGS.md). Chez CardNexus le `finish` dit déjà
de quel tirage il s'agit — c'est ce qui rendrait ce rattachement possible.

## Comment les cartes sont reconnues

### Chez CardNexus : par extension et numéro

Rien à deviner : le catalogue donne de chaque produit son extension — nommée,
et portant le code de l'éditeur — et son numéro de collection. Une carte et un
produit sont la même carte quand ils portent **le même code d'extension et le
même numéro**. C'est une identité, pas une ressemblance : ni seuil, ni score, ni
appariement dans l'ordre.

Ne restent que deux détails d'écriture, traduits des deux côtés à la fois : les
codes se comparent sans casse ni ponctuation, et les numéros sans leurs zéros de
tête — `027a` et `27a` sont le même numéro, et restent distincts de `027`.

Le reste est écarté et compté dans le bilan de l'import : les produits scellés,
ceux dont l'extension n'a pas de code, ceux sans numéro de collection, ceux dont
aucune carte ne porte le numéro, et ceux qui tomberaient sur **deux** cartes de
même numéro — leur donner le même prix reviendrait à en inventer un.

Quand un code d'extension s'écrit franchement autrement des deux côtés, ou que
CardNexus n'en publie pas, le profil du jeu le dit
(`CARDNEXUS_GAME_PROFILES`) : c'est une table, pas une heuristique. Elle est
vide aujourd'hui — les deux catalogues tiennent leur code de l'éditeur — et le
bilan de l'import (`--sets`) montre extension par extension ce qui a été
rapproché, de quoi la remplir si besoin.

### Chez Cardmarket : par le nom, et par déduction

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
recherche (`/api/games/<jeu>/cards`), la fiche d'une carte
(`/api/games/<jeu>/cards/<carte>`), la collection (`getGameCollection`) et le
contenu d'un booster (`withCardAttributes`) les rattachent aux cartes qu'ils
renvoient déjà. Une carte de l'index de recherche est retrouvée par son
`cardId` — l'index épure l'identifiant, le relevé porte le vrai.

### Sur l'application mobile, et hors ligne

L'application mobile lit le même champ `marketPrice` que le web, aux mêmes
endroits : vignette de la galerie, vignette de la collection — personnelle ou
de groupe — et fiche de la carte, où il est accompagné de sa date de relevé et
du lien vers la place de marché d'où il vient.

Elle n'y montre que le montant de référence, jamais les valeurs qui
l'entourent (prix bas, tendance, moyenne 30 jours) : un téléphone en manque de
place, et surtout la fiche doit se lire pareil avec ou sans réseau. Le document
d'export hors ligne porte en effet le même `marketPrice` compact sur chaque
carte cotée (cf. docs/GAME_EXPORTS.md) — un relevé complet par carte pèserait
ses `offers` sur tout un catalogue, pour un écran qui n'en montrerait rien.

Les prix d'un jeu téléchargé datent donc de la génération de son document :
c'est déjà le cas de ses cartes et de ses erratas, et l'écran « Hors ligne »
affiche cette date.

### Lien vers la place de marché

Un prix renvoie à la fiche du produit d'où il vient, **chez la place de marché
qui l'a relevé** — un lien construit pour l'une mène à une page inexistante chez
l'autre. Le relevé porte donc sa `source`, jusque dans le prix compact qu'un
écran affiche, et `marketProductUrl` (`lib/prices/sources.ts`) est le seul
endroit qui en tire une adresse.

| Place de marché | Adresse |
| --- | --- |
| Cardmarket | `https://www.cardmarket.com/en/<Jeu>/Products?idProduct=<id>` |
| CardNexus | `https://cardnexus.com/en/explore/<jeu>/card/card/card-<id>` |

Les deux se construisent à partir du **seul identifiant du produit** : chacune
redirige vers la bonne page. Chez CardNexus, les segments d'extension et de nom
ne servent qu'à la lisibilité de l'adresse et sont ignorés — nos relevés ne les
portent pas, d'où les segments neutres. Le segment de jeu, lui, ne se devine
d'aucun côté (`fab` s'écrit `FleshAndBlood` chez Cardmarket) : il vient de
`CARDMARKET_GAME_PATHS` et de `CARDNEXUS_GAME_IDS`, et un jeu absent de sa table
n'a pas de lien plutôt qu'un lien mort.

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

### Valeur d'une collection

La collection porte elle aussi une valeur estimée, par jeu et pour l'ensemble :
la somme des prix de chaque **exemplaire** possédé — une carte possédée en
triple compte trois fois. Un exemplaire vaut le prix de sa carte au catalogue,
quels que soient son état, sa langue et son tirage : les relevés ne distinguent
pas les impressions, et inventer une décote au foil ou à l'abîmé serait une
invention.

Comme pour un booster, le résultat est **écrit** (`collection-values`, un
document par jeu et par propriétaire) plutôt que recalculé à chaque affichage :
additionner les prix de milliers d'exemplaires à chaque ouverture de l'écran
coûterait cher pour un chiffre qui ne bouge qu'au rythme des imports. Et
surtout, un relevé daté se compare — d'un mois à l'autre, d'un jeu à l'autre —
là où un total recalculé en continu ne dit jamais de quand il parle.

Le recalcul est donc une action explicite, à deux mailles :

| Bouton | Route | Ce qu'il refait |
| --- | --- | --- |
| Valeur d'un jeu, sur sa page de collection | `POST /api/collection/games/<jeu>/value` | ce seul jeu |
| Valeur totale, sur la vue d'ensemble | `POST /api/collection/value` | tous les jeux dont une carte est possédée |
| Les mêmes, dans un groupe de jeu | `POST /api/play-groups/<groupe>/collection[/games/<jeu>]/value` | idem, pour la collection commune |

La collection d'un groupe est commune — n'importe quel membre y ajoute et en
retire des cartes —, donc n'importe quel membre peut en redemander la valeur.
Les jeux désactivés pour le groupe sont écartés du recalcul global : l'écran ne
les montre pas, les estimer écrirait une valeur que personne ne verrait.

Un recalcul global reprend les jeux dont une carte est possédée **et ceux qui
portent déjà une valeur** : sans ce second groupe, un jeu vidé de ses cartes
garderait la sienne pour toujours — plus rien ne le possède, donc plus rien ne
le réestime — et le total continuerait de compter une collection qui n'existe
plus.

**Le total, lui, n'est pas stocké** : il se déduit des valeurs par jeu
(`totalCollectionValue`). Deux nombres écrits séparément finissent par se
contredire — un jeu recalculé seul laisserait un total périmé qui, lui, ne
dirait pas qu'il l'est. Le total est daté du **plus ancien** des calculs dont il
est fait, et ne compte que les jeux qui en ont un.

La valeur dit sur combien d'exemplaires elle repose (`pricedCopies` sur
`copies`) : les cartes sans relevé n'y entrent pas, et un total porté par deux
cents exemplaires sur mille ne se lit pas comme le prix de la collection.
L'écran signale par ailleurs qu'elle a vieilli dès que le nombre d'exemplaires
possédés a changé depuis le calcul.

Les produits — figurines, boîtes — n'entrent pas dans ce total : ils n'ont pas
de relevé de prix.

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

Un script par fournisseur, tous deux lancés à la main depuis la racine du dépôt.
Ils sont indépendants et rejouables : deux imports de suite réécrivent les mêmes
documents, et l'un n'efface jamais les relevés de l'autre.

```sh
node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/prices/import-cardnexus.ts --game riftbound

node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/prices/import-cardmarket.ts --game fab
```

| Option | CardNexus | Cardmarket |
| --- | --- | --- |
| `--game <slug>` | le jeu à traiter (`riftbound` par défaut) | idem (`fab` par défaut) |
| `--dry-run` | rapproche et affiche le bilan sans rien écrire | idem |
| détail des extensions | `--sets`, la moins couverte en tête | `--expansions` |

Les deux affichent à chaque fois combien de cartes ont été rapprochées, combien
de produits ont été écartés et pourquoi, et les extensions les moins couvertes.

`MONGODB_URI` est nécessaire aux deux ; l'import CardNexus demande en plus
`CARDNEXUS_API_KEY`, quand les fichiers de Cardmarket ne demandent aucune
authentification.

## Ajouter un jeu

Le jeu doit avoir ses cartes dans MongoDB : c'est de là que les deux scripts
lisent le catalogue. Magic fait exception (voir plus haut).

### Chez CardNexus

`CARDNEXUS_GAME_IDS` (`lib/prices/cardnexus.ts`) : l'identifiant du jeu chez
CardNexus, un slug. La liste à jour se lit sur `GET /v1/games` ; les connus sont
`mtg`, `pokemon`, `fab`, `onepiece`, `lorcana`, `swu`, `riftbound`, et une
douzaine d'autres jeux que la plateforme n'a pas encore. Yu-Gi-Oh n'y est pas.

Rien d'autre n'est nécessaire : le rapprochement se fait par extension et
numéro, sans profil. Lancez l'import en `--dry-run --sets` et regardez ce que
les extensions donnent — c'est là qu'un code d'extension divergent se voit, et
`CARDNEXUS_GAME_PROFILES` (`lib/prices/cardnexus-matching.ts`) sert à le
traduire.

### Chez Cardmarket

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

## Implémentation

- `lib/types/card-price.ts` : le relevé, ses valeurs, et l'ordre des
  fournisseurs (`CARD_PRICE_SOURCES`).
- `lib/prices/sources.ts` : le nom d'une place de marché et le lien vers son
  produit, couverts par `sources.test.ts`.
- `lib/prices/offers.ts` : le choix du tirage de référence, commun aux deux
  fournisseurs.
- `lib/prices/cardnexus.ts` : les identifiants de jeu, les types des feeds et le
  lien vers un produit.
- `lib/prices/cardnexus-feed.ts` : les métadonnées d'un feed et sa lecture ligne
  à ligne, couvertes par `cardnexus-feed.test.ts`.
- `lib/prices/cardnexus-matching.ts` : le rapprochement par extension et numéro,
  couvert par `cardnexus-matching.test.ts`.
- `lib/prices/cardnexus-prices.ts` : construction du relevé et choix des valeurs
  retenues, couverts par `cardnexus-prices.test.ts`.
- `lib/prices/cardmarket.ts` : les deux fichiers publics, leurs types et les
  identifiants de jeu.
- `lib/prices/cardmarket-matching.ts` : reconnaissance des extensions et des
  cartes, couverte par `cardmarket-matching.test.ts`.
- `lib/prices/cardmarket-prices.ts` : construction du relevé, couverte par
  `cardmarket-prices.test.ts`.
- `lib/db/card-prices.ts` : écriture et lecture de `card-prices`, dont
  `getMarketPrices` et `withMarketPrices`, qui rattachent leur prix à un lot
  de cartes sans une requête par carte — et qui choisissent, carte par carte, le
  fournisseur qui la représente.
- `lib/prices/display.ts` : le montant qui représente une carte, la somme d'un
  lot et leur mise en forme, couverts par `display.test.ts`.
- `components/cards/CardPriceTag.tsx` et `CardPriceDetails.tsx` : l'affichage,
  partagé par tous les écrans qui listent des cartes.
- `lib/trade/pricing.ts` : prix appliqué, total d'une face et écart entre les
  deux, couverts par `pricing.test.ts`.
- `lib/db/boosters.ts` : `computeBoosterValue`, derrière
  `app/api/collection/boosters/[boosterId]/value`.
- `lib/collection/value.ts` : somme des exemplaires possédés et total d'une
  collection, couverts par `value.test.ts`.
- `lib/db/collection-values.ts` : lecture et recalcul des valeurs, derrière
  `app/api/collection/value` et `app/api/collection/games/[gameSlug]/value`.
- `app/collection/CollectionValueSection.tsx` : l'affichage et son bouton,
  partagé par la vue d'ensemble et la page d'un jeu.
- `scripts/prices/import-cardnexus.ts` et `scripts/prices/import-cardmarket.ts` :
  les deux imports, lancés à la main.
