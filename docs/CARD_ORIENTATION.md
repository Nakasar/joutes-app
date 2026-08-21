# Sens d'impression des cartes

La quasi-totalité des cartes se lisent à la verticale. Certaines sont imprimées
dans le sens de la largeur : les champs de bataille de Riftbound, dont
l'illustration est plus large que haute. Le champ `orientation` le dit, et
l'affichage s'en sert pour les présenter pivotées d'un quart de tour.

## Le champ

```ts
type CardOrientation = "portrait" | "landscape";
```

`orientation` est une propriété de carte comme `type` ou `rarity`
(`CardAttributes`, `lib/types/card.ts`) : chaque jeu la renseigne — ou non —
pour ses cartes. **Une carte qui ne porte pas le champ est en `portrait`** :
c'est le cas de l'immense majorité du catalogue, et rien ne sert de l'écrire
partout. `isLandscapeCard()` est la seule lecture à faire du champ.

Étant listée dans `CARD_ATTRIBUTE_KEYS`, la propriété est recopiée sur les
exemplaires qui reprennent les attributs du catalogue — les cartes d'un booster
— sans plomberie supplémentaire.

## Sur un exemplaire enregistré

Une carte de liste de souhaits, de liste de vente, d'échange ou de cube n'est
pas une carte du catalogue : c'est une copie, faite au moment où l'exemplaire a
été créé, qui n'en garde que le nom, l'image et le numéro. Le sens d'impression
n'y est **pas recopié**. Le recopier laisserait sans rien tous les exemplaires
enregistrés avant l'arrivée du champ, et figerait sur chaque copie une valeur
que le catalogue peut corriger.

Il est donc relu à l'affichage, par `findLandscapeCards` /
`withCardOrientation` (`lib/db/card-orientations.ts`) : une requête par lot de
cartes affichées, qui ne remonte que les cartes paysage — une poignée dans un
catalogue. Chaque chemin de lecture l'appelle une fois, à l'endroit où il
appelle déjà les prix de marché, qui suivent la même logique et pour la même
raison.

L'identité d'une carte s'y lit d'abord sur `cardId`, puis sur son impression
(extension + numéro) pour les entrées assez anciennes pour ne pas en porter. Le
jeu borne les deux quand l'appelant le connaît — ni `cards.id` ni le couple
extension/numéro ne sont uniques d'un jeu à l'autre. Les cartes d'un cube, qui
n'emportent pas leur jeu, s'en passent : la recherche ne remontant que des
cartes paysage, une confusion supposerait deux jeux partageant un identifiant
*et* l'un d'eux imprimant cette carte en largeur.

## À l'import

`scripts/games/riftbound/import-cards.ts` écrit `orientation: 'landscape'` sur
les cartes de type `Battlefield`, et rien sur les autres. Les cartes déjà en
base prennent le champ à la prochaine exécution de l'import.

## À l'affichage

`components/cards/CardImage.tsx` (web) et `src/components/CardImage.tsx`
(mobile) remplacent l'`<img>` d'une carte partout où son sens d'impression est
connu. En portrait, le composant rend l'image telle quelle ; en paysage, il la
pose dans une vignette au format d'une carte, à plat — aussi large que la
vignette est haute, aussi haute qu'elle est large — puis la pivote d'un quart
de tour. Une fois tournée, l'image recouvre exactement la vignette : la carte
garde son rang dans la grille au lieu d'y être deux fois moins haute que ses
voisines, ou rognée de part et d'autre du dessin.

Le quart de tour est **anti-horaire** : c'est le sens qui remet le titre et le
texte de la carte le long du bord droit de la vignette, comme le fait la
galerie officielle de Riftbound.

Côté mobile, le pivot est décrit une seule fois en CSS (`.card-landscape`,
`src/styles.css`) ; la vignette garde sa propre classe, qui continue de porter
la taille, les coins et l'ombre. Une vignette qui n'est pas au format d'une
carte corrige `--card-frame-ratio` ; côté web, c'est la propriété `frame` du
composant qui joue ce rôle.

Attention en ajoutant une vignette : le cadre est un `span` là où le code
attendait une image, et une image porte d'elle-même deux choses qu'il n'a pas.
Elle a des proportions propres, dont se déduit le côté qu'on ne lui donne pas —
d'où l'`aspect-ratio` du cadre, sans lequel une vignette qui ne contraint qu'une
dimension le réduit à un trait. Et elle est remplacée, donc dimensionnable même
en ligne — d'où le `display: block` du cadre, sans lequel une vignette qui ne
déclare que `width` et `height` s'effondre.

## Le formulaire d'administration

Seul endroit où une carte paysage reste affichée telle quelle : l'aperçu de
l'image dans `/admin/cards`. Ce qu'un administrateur y regarde, c'est le
fichier qu'il vient de téléverser — le pivoter lui cacherait ce qu'il est en
train de vérifier.
