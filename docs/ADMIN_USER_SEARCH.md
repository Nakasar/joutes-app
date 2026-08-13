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
contenir. Un `#` sans nombre derrière ne fait pas un tag : la saisie retombe
alors sur la recherche par fragment.

Le fragment est **échappé** avant de servir d'expression régulière : sans cela,
chercher `(test` ferait échouer la requête, et `.*` balaierait la collection.

Le pseudonyme de compte se cherche sous `name` **et** sous `username` : les
comptes créés par better-auth portent le premier, les plus anciens le second, et
`toUser` relit déjà les deux.

## Modules

- `lib/users/admin-search.ts` — interprétation de la saisie
  (`parseAdminUserSearch`), forme d'un résultat (`AdminUserSummary`) et tag
  affiché (`adminUserTag`). Module pur : `lib/db/users.ts` ouvre une connexion
  MongoDB au chargement et ne peut pas être importé par un test, alors que
  l'interprétation de la saisie est exactement ce qui mérite d'en avoir un.
- `lib/db/users.ts` — `searchUsersForAdmin(term, limit)`. Projection étroite,
  25 résultats par défaut, 50 au maximum.
- `app/admin/users/page.tsx` — la page. Formulaire en **GET** plutôt qu'un
  composant client : la recherche tient dans l'URL, se partage, se recharge, et
  fonctionne sans JavaScript.

Les résultats mènent au profil public `/users/{id}`, par identifiant : un tag
demanderait d'être encodé dans l'URL, et un pseudonyme change.

## Tests

```bash
npm run test
```

- `lib/users/admin-search.test.ts` — saisie vide, identifiant contre pseudonyme
  qui lui ressemble, tag complet et tag incomplet, `@` de mention, échappement
  des caractères d'expression régulière.
