# Filtres et tri de l'exploration des cartes

La galerie de cartes d'un jeu (`/games/:slug/cards`) filtre et trie sur les
**attributs que portent réellement ses cartes** : plages d'énergie, de puissance
ou de might sur Riftbound, domaines, raretés… Rien n'est figé par jeu dans le
code — les attributs sont déduits du catalogue, comme le fait déjà le formulaire
d'administration des cartes.

## Facettes

`getGameCardFilterFacets` (`lib/db/cards.ts`) part de
`getGameCardAttributeFields` et en tire deux formes :

| Forme | Attribut | Interface |
| --- | --- | --- |
| `number` | numérique, avec ses bornes réelles | deux champs min / max |
| `value` | liste de valeurs (≤ 40) | cases à cocher |

Les valeurs sont relevées sur un échantillon, mais **les bornes numériques sont
calculées sur tout le catalogue** : une plage qui n'irait pas jusqu'aux extrêmes
rendrait des cartes impossibles à atteindre. Un attribut numérique dont toutes
les cartes portent la même valeur est écarté — sa plage n'aurait rien à régler.
`type` l'est aussi : il a déjà son propre filtre.

## Paramètres

- `min_<attribut>` / `max_<attribut>` — bornes d'un attribut numérique. Une
  seule des deux suffit ; des bornes inversées sont remises dans l'ordre plutôt
  que de rendre une liste vide sans explication.
- `in_<attribut>` — valeurs séparées par des virgules. Les valeurs d'un même
  attribut s'entendent comme un « ou », les attributs entre eux comme un « et ».
- `sort` — `<clé>:asc|desc` sur `name`, `collectorNumber` ou tout attribut
  numérique.

Tout est écrit dans l'URL : une recherche filtrée se partage telle quelle.

### Rien de ce qui arrive n'est recopié dans une requête

Une expression de filtre Meilisearch est du texte. `parseCardSearchCriteria`
(`lib/cards/search-filters.ts`) n'accepte donc que ce que le jeu porte : un
attribut inconnu, une borne qui n'est pas un nombre ou une valeur absente de la
facette sont ignorés, et les valeurs retenues sont échappées avant d'entrer dans
l'expression. Le module est couvert par `lib/cards/search-filters.test.ts`.

## Réglages de l'index

**Meilisearch refuse de filtrer ou de trier sur un attribut qui n'a pas été
déclaré.** Les attributs filtrables et triables sont donc réglés par
`cardIndexSettings` au moment de la réindexation, depuis le bouton **« Mettre à
jour l'index »** de l'administration des cartes.

Conséquence pratique : **un jeu dont l'index n'a pas été mis à jour depuis cette
fonctionnalité n'a pas encore ces filtres.** Plutôt qu'une page en erreur, la
recherche refait alors sa requête sans les critères refusés et renvoie
`filtersUnavailable`, que l'interface traduit par un avertissement invitant à
relancer la réindexation. C'est aussi ce qui rattrape un jeu dont le catalogue a
gagné un nouvel attribut.

Ce repli ne vaut que pour un refus explicite des critères —
`invalid_search_filter` et `invalid_search_sort`, reconnus par
`isUndeclaredCriteriaError`. Une coupure réseau, une clé refusée ou un index
absent remontent : les rattraper ici rendrait des résultats non filtrés à la
place d'une panne, sur une page qui a l'air de répondre.

## Implémentation

- `lib/cards/search-filters.ts` — lecture des critères, expressions de filtre,
  tri, sérialisation. Couvert par ses tests.
- `lib/db/cards.ts` — `getGameCardFilterFacets`.
- `lib/meilisearch.ts` — `cardIndexSettings`.
- `app/admin/cards/actions.ts` — réglages appliqués à la réindexation.
- `app/api/games/[gameId]/cards/route.ts` — critères, tri, repli.
- `lib/cards/search-syntax.ts` — la barre de recherche accepte les mêmes
  attributs en tokens (`domain:fury energy<=3`), voir
  [CARD_SEARCH_SYNTAX.md](./CARD_SEARCH_SYNTAX.md).
- `components/cards/CardFacetFilters.tsx` — les filtres eux-mêmes (plages,
  valeurs à cocher, « effacer »), partagés par les trois écrans qui cherchent
  des cartes.
- `components/cards/CardSearchInput.tsx` — la saisie et ses suggestions.
- `components/cards/CardSearchToolbar.tsx` — saisie, bouton de filtrage et
  panneau, tels que les montent les éditeurs.
- `app/games/[gameSlugOrId]/cards/components.tsx` — barre latérale de filtres
  (à demeure sur bureau, dépliable sur mobile), sélecteur de tri, résumé des
  filtres actifs en pastilles retirables, grille ou liste.

## Les mêmes filtres dans les éditeurs

L'éditeur de paquet de cube et l'éditeur de booster cherchent des cartes avec la
même barre et les mêmes filtres, servis par la même réponse d'API — la recherche
y renvoie déjà les facettes du jeu.

Une différence d'usage : **les filtres y sont repliés derrière un bouton**. Sur
la galerie, on explore un catalogue et la barre latérale mérite sa place ; dans
un éditeur, on ajoute le plus souvent une carte qu'on connaît déjà, et le
panneau prendrait celle des résultats. Le bouton porte le nombre de filtres
actifs : un panneau refermé ne laisse jamais croire à une recherche sans
critère.

Ces écrans n'écrivent pas leurs critères dans l'URL — on n'y partage pas une
recherche, on remplit un paquet.
