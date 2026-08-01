# Foil et variantes d'impression

Deux champs communs des cartes décrivent leur tirage : `foil` et `printings`.
Ils sont saisis dans le formulaire d'administration des cartes
(`/admin/cards`), à côté du nom et de l'image.

## `foil`

`foil: true` marque une carte qui n'existe qu'en foil. Elle est alors affichée
comme telle partout : voile irisé (`.foil-shine`) sur son illustration dans la
liste des cartes et sur sa fiche, badge « Foil » à côté de son nom, et les
exemplaires ajoutés à une collection depuis sa fiche sont enregistrés en foil
(la case correspondante est cochée et verrouillée).

Le champ n'est écrit en base que lorsqu'il vaut `true` : décoché, il est retiré
du document.

## `printings`

`printings` liste les tirages d'une même carte — même numéro de collection,
plusieurs impressions : version normale, foil, promo pack, pre-release, judge…

```ts
type CardPrinting = {
  id: string;      // dérivé du nom, unique au sein de la carte
  name: string;    // « Promo Pack Nexus »
  foil?: boolean;  // variante imprimée en foil
  image?: string;  // illustration propre à la variante (facultative)
};
```

- L'identifiant est calculé à partir du nom (`buildPrintingId`) au moment où la
  variante est créée, puis rendu unique par `withUniquePrintingIds` : renommer
  une variante ne change pas son identifiant, ce qui permettra d'y faire
  référence (collection, listes de vente…).
- L'image est facultative : sans elle, la variante reprend l'illustration de la
  carte. La fiche de la carte affiche les variantes sous son illustration, avec
  le voile irisé sur celles qui sont foil.
- Une carte accepte au plus 30 variantes ; une ligne sans nom n'est pas
  enregistrée.

## Choisir une variante à l'ajout

Partout où un utilisateur enregistre un exemplaire, il choisit la variante ;
la version de base reste le choix par défaut :

| Écran | Où |
| --- | --- |
| Collection (fiche carte, collection d'un jeu, collection d'un groupe) | `CollectionManager`, dialogue d'ajout |
| Booster | `BoosterEditor`, sélecteur sous chaque carte du résultat de recherche |
| Liste de souhaits | `AddToWishlistButton` et le dialogue d'ajout d'une wishlist |
| Liste de vente | héritée de l'exemplaire de collection mis en vente |

La variante retenue est résolue par `resolvePrinting` (`lib/cards/printings.ts`) :

- une variante imprimée en foil **impose** le foil sur l'exemplaire — la case
  « Foil » est alors cochée et verrouillée, comme pour une carte toujours foil ;
- l'exemplaire reprend l'illustration de la variante quand elle en a une ;
- un identifiant de variante inconnu (variante supprimée depuis) retombe sur la
  version de base plutôt que d'échouer.

L'exemplaire enregistre `printingId` et `printingName` : le libellé est
recopié pour pouvoir l'afficher sans relire la carte. Deux variantes d'une même
carte comptent pour deux souhaits distincts dans une wishlist (la
déduplication inclut la variante).

Les variantes n'étant saisies que par le formulaire d'administration, qui
réindexe la carte, elles sont aussi présentes dans les résultats de recherche
Meilisearch — c'est ce qui permet de les proposer dans les écrans qui ajoutent
une carte depuis une recherche.

## Implémentation

- `lib/types/card.ts` : type `CardPrinting`.
- `lib/constants/cards.ts` : `foil` et `printings` sont des champs communs
  (`CORE_CARD_KEYS`), donc jamais confondus avec les attributs de jeu.
- `lib/constants/card-ids.ts` : `buildPrintingId`, `withUniquePrintingIds`.
- `lib/schemas/card.schema.ts` : `cardPrintingSchema` et les deux champs sur
  `cardSchema`.
- `app/admin/cards/CardForm.tsx` : case « carte toujours foil » et section
  « Variantes d'impression » (nom, foil, image avec téléversement).
- `app/games/[gameSlugOrId]/cards/[cardId]/page.tsx` et
  `app/games/[gameSlugOrId]/cards/components.tsx` : affichage.
- `lib/cards/printings.ts` : `resolvePrinting` / `isFoilForced`, couverts par
  `lib/cards/printings.test.ts`.
- `components/PrintingPicker.tsx` : sélecteur partagé (n'affiche rien si la
  carte n'a pas de variante).
