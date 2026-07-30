# Erratas

Les erratas (erratas, clarifications et rulings) sont rattachés à une ou
plusieurs cartes et affichés sur la page de chaque carte
(`/games/{game}/cards/{cardId}`). C'est un contenu communautaire : leur
pertinence est arbitrée par les votes et par les signalements.

## Qui peut faire quoi

| Action                        | Qui                                                        |
| ----------------------------- | ---------------------------------------------------------- |
| Consulter                     | Tout le monde                                              |
| Voter (pour / contre)         | Utilisateurs connectés (`erratas:vote`)                    |
| Signaler                      | Utilisateurs connectés                                     |
| Créer                         | Utilisateurs connectés                                     |
| Modifier / supprimer          | L'auteur de l'errata, ou la permission `erratas:manage`     |

Les administrateurs disposent implicitement de toutes les permissions.

`erratas:manage` remplace l'ancienne permission `erratas:update`, qui reste
honorée (`PERMISSION_ALIASES` dans `lib/db/permissions.ts`) : les comptes qui
la portent conservent leurs droits de modération sans migration de base.

## Implémentation

- `app/games/[gameSlugOrId]/actions.ts` : `createErrata` n'exige qu'une session
  authentifiée ; `updateErrata` et `deleteErrata` passent par
  `requireErrataEditRights`, qui autorise l'auteur (`createdBy`) ou un
  détenteur de `erratas:manage`.
- `app/games/[gameSlugOrId]/cards/[cardId]/page.tsx` : le bouton d'ajout
  s'affiche pour tout utilisateur connecté, les boutons modifier/supprimer
  seulement sur les erratas dont il est l'auteur (ou pour un modérateur).
- La suppression d'un errata supprime aussi ses votes et ses éventuels
  signalements.
