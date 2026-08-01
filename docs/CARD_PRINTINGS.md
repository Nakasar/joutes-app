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
