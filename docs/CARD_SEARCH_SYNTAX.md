# Syntaxe de recherche des cartes

La barre de recherche de la galerie accepte des tokens en plus du texte libre :

```
domain:fury energy<=3 deathknell
```

`domain:fury` et `energy<=3` filtrent, `deathknell` reste le texte cherché.

## Le vocabulaire vient du jeu, pas du code

`buildSearchFields` (`lib/cards/search-syntax.ts`) part des **facettes du jeu** —
les mêmes que la barre latérale de filtres — et des valeurs que porte
réellement son catalogue. Riftbound obtient `energy`, `might`, `domain`,
`rarity` sans qu'aucun de ces noms n'apparaisse dans le code ; un autre jeu
obtient les siens.

S'y ajoutent trois champs communs : `set`, `type`, `lang`.

Un **raccourci d'une lettre** est attribué à chaque champ dont l'initiale ne
désigne que lui : `d:fury`, `e<=3`. Deux champs qui partagent leur initiale n'en
reçoivent aucun — un `m` tantôt `might`, tantôt `mana` vaut moins que pas de
raccourci du tout.

## Opérateurs

| Forme | Sur | Effet |
| --- | --- | --- |
| `champ:valeur` | attribut à valeurs, `set`, `type`, `lang` | égalité, casse indifférente |
| `champ=valeur` | idem | identique à `:` |
| `champ=3` | attribut numérique | vaut exactement 3 |
| `champ<=3` / `champ>=3` | attribut numérique | borne inclusive |
| `champ<3` / `champ>3` | attribut numérique | borne stricte, ramenée à l'entier voisin |

Une valeur qui contient une espace se met entre guillemets :
`type:"Battlefield Rune"`.

Deux tokens sur le même attribut se cumulent : `energy>=2 energy<=5` donne une
plage, et la borne la plus restrictive gagne. Deux valeurs d'un même attribut
s'entendent comme un « ou », comme dans la barre latérale — et les deux sources
fusionnent : un `domain:fury` tapé s'ajoute aux domaines cochés à gauche.

### `e:` reste une extension

`:` n'a pas de sens sur un attribut numérique, et le mot repart au texte libre.
C'est délibéré : `e:OGN` désigne depuis toujours une extension dans la
recherche de cartes, et l'alias `e` d'`energy` ne doit pas le lui prendre.
L'énergie s'écrit `e=3`, `e<=3`, `e>=3`.

## Rien ne devient une erreur de syntaxe

Un mot qui ne ressemble à aucun champ connu **reste du texte cherché** :
`cn:125` continue d'être lu par les filtres historiques de la recherche, et
taper un nom de carte ne doit jamais se transformer en erreur.

En revanche, un champ reconnu suivi d'une valeur inutilisable — `domain:dragon`,
`energy<=beaucoup` — est **signalé sous les résultats** plutôt que silencieux :
sans ça, la liste s'élargirait sans explication. Le mot en cours de frappe est
exclu de ces avertissements, sinon chaque lettre tapée en déclencherait un.

## Suggestions

Le menu propose, selon ce qui est tapé :

- rien encore : un aperçu de ce que le jeu sait filtrer ;
- `domain:` : les valeurs réelles de l'attribut ;
- `fur` : les champs dont le nom commence ainsi **et** les valeurs qui
  commencent ainsi — taper « fury » propose `domain:Fury` sans avoir à deviner
  le nom du champ.

Une fois l'opérateur posé (`energy<=`), le menu propose des bornes du
catalogue ; une fois la borne tapée, il n'a plus rien à compléter et se tait.
Après `e:` il ne propose rien non plus : ce mot repartira au texte libre, et
suggérer une énergie promettrait un filtre qui ne sera pas appliqué.

Un filtre déjà posé n'est pas reproposé, quelle que soit son écriture : `d:fury`
et `domain:Fury` sont comparés sous leur forme canonique.

↑ ↓ parcourent la liste, Entrée complète la suggestion en cours ou lance la
recherche si aucune n'est sélectionnée. L'option mise en évidence est reliée au
champ par `aria-activedescendant`, le focus ne quittant jamais la saisie.

Les explications du menu sont décrites par le module et **mises en phrase par
l'interface** : il tourne aussi côté serveur, et l'application parle quatre
langues.

## Où la saisie est lue

**Côté serveur, à chaque requête** (`app/api/games/[gameId]/cards/route.ts`) :
c'est ce qui fait qu'un lien partagé s'ouvre déjà filtré, dès le premier rendu,
sans attendre que le navigateur connaisse les facettes.

Le navigateur relit la même saisie avec le même module, mais seulement pour
l'affichage : pastilles, suggestions, avertissements.

## Implémentation

- `lib/cards/search-syntax.ts` — champs, lecture, fusion, suggestions. Couvert
  par `lib/cards/search-syntax.test.ts`.
- `app/api/games/[gameId]/cards/route.ts` — lecture des tokens avant la
  recherche, fusion avec les critères d'URL.
- `components/cards/CardSearchInput.tsx` — la saisie, son menu de suggestions
  et la navigation au clavier, partagés par la galerie et les éditeurs.
- `app/games/[gameSlugOrId]/cards/components.tsx` — pastilles, avertissements.

## La même syntaxe dans les éditeurs

Les éditeurs de booster et de paquet de cube envoient leur saisie telle quelle :
c'est l'API qui lit les tokens, ils n'ont donc rien à en connaître. Deux nuances
propres à ces écrans :

- **un nombre seul reste un numéro de collection** (`cardSearchText`) — le
  raccourci qui existait avant, et qu'on tape sans y penser ;
- **les suggestions ne s'ouvrent qu'à la frappe**, pas à la prise de focus : à
  l'ouverture, les flèches doivent mener aux résultats, pas à une liste de
  champs ;
- **un ajout ne garde que les filtres** (`keepFilterTokens`) : le nom de la
  carte ajoutée s'en va — on passe à la suivante — mais les tokens tapés
  décrivent le paquet qu'on est en train de composer et tiennent d'un ajout à
  l'autre. La barre repart avec une espace finale, prête pour le nom suivant.
