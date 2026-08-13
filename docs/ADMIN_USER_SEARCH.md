# Recherche d'utilisateurs (administration)

Atteindre le profil d'un joueur sans avoir à retrouver un lien vers lui.
**Administration → Utilisateurs**, une barre de saisie, un tableau de résultats.

## Principes

- **Aucune adresse e-mail, nulle part.** C'est une donnée personnelle. Elle ne
  s'affiche pas, et elle ne sert pas non plus à chercher : une recherche par
  e-mail confirmerait qu'une adresse donnée appartient à un compte, ce qui
  revient à l'exposer. La lecture ne la rapporte même pas de la base — l'oubli
  d'un champ à l'affichage ne peut donc pas la révéler.
- **Une seule barre, trois façons de désigner quelqu'un.** L'administrateur ne
  choisit pas un mode avant de taper : la saisie est interprétée.
- **Une recherche vide ne cherche rien.** Elle listerait la base entière, ce qui
  n'est ni un besoin ni un geste anodin.

## Ce qui se cherche

| Saisie | Interprétation |
| --- | --- |
| `507f1f77bcf86cd799439011` | identifiant recopié (24 caractères hexadécimaux) |
| `Alice#1234` | tag complet — pseudonyme et nombre, comparés sans tenir compte de la casse |
| `ali` | fragment de pseudonyme (`name`, `username` ou `displayName`) |

Un `@` de tête est retiré : c'est le préfixe d'une mention recopiée, pas une
partie du pseudonyme. Le dernier `#` sépare le tag, un pseudonyme pouvant en
contenir.

Le discriminateur doit être **un nombre** — la longueur n'est pas imposée : la
plateforme en génère quatre chiffres, un compte importé peut en porter moins, et
refuser son tag ne rendrait service à personne. Quand ce qui suit le `#` n'en est
pas un (`Alice#`, `Alice#abc`), il n'y a pas de tag à résoudre : c'est le
pseudonyme de gauche qui est cherché comme fragment. Chercher la saisie entière
ne trouverait rien — aucun pseudonyme ne contient `Alice#`.

Le fragment est **échappé** avant de servir d'expression régulière : sans cela,
chercher `(test` ferait échouer la requête, et `.*` balaierait la collection.

Le pseudonyme de compte se cherche sous `name` **et** sous `username` : les
comptes créés par better-auth portent le premier, les plus anciens le second, et
`toUser` relit déjà les deux.

## Modules

- `lib/users/admin-search.ts` — interprétation de la saisie
  (`parseAdminUserSearch`), forme d'un résultat (`AdminUserSummary`), tag
  affiché (`adminUserTag`, qui retombe sur l'identifiant pour un compte sans
  aucun nom : une ligne vide serait indistinguable d'une autre) et adresse du
  profil (`adminUserProfilePath`). Module pur : `lib/db/users.ts` ouvre une connexion
  MongoDB au chargement et ne peut pas être importé par un test, alors que
  l'interprétation de la saisie est exactement ce qui mérite d'en avoir un.
- `lib/db/users.ts` — `searchUsersForAdmin(term, limit)`. Projection étroite,
  25 résultats par défaut, 50 au maximum.
- `app/admin/users/page.tsx` — la page. Formulaire en **GET** plutôt qu'un
  composant client : la recherche tient dans l'URL, se partage, se recharge, et
  fonctionne sans JavaScript.

Les résultats mènent au profil public par **tag concaténé sans son `#`** —
`Nakasar#6666` devient `/users/Nakasar6666` : c'est la forme que la page sait
résoudre (elle recolle le `#` en découpant les quatre derniers caractères), et
celle des liens de profil partout ailleurs dans l'application. Un compte sans
pseudonyme personnalisé n'a pas de tag : son identifiant sert alors d'adresse,
l'autre forme reconnue par la page.

## Tests

```bash
npm run test
```

- `lib/users/admin-search.test.ts` — saisie vide, identifiant contre pseudonyme
  qui lui ressemble, tag complet, discriminateur non numérique, tag incomplet,
  `@` de mention, échappement des caractères d'expression régulière, repli du
  tag affiché sur l'identifiant, et adresse de profil (tag concaténé, encodage,
  repli sur l'identifiant).
