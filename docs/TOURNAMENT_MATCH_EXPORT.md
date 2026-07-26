# Fonctionnalité : feuilles de match et export des matchs

## Vue d'ensemble

Le portail organisateur permet de sortir les matchs d'un tournoi sur papier ou en
tableur :

- **Feuilles de match d'une ronde**, prêtes à imprimer et à faire remplir par les
  joueurs ;
- **Liste des matchs**, en page imprimable (affichage) et en CSV (archivage,
  retraitement).

Ces sorties sont réservées au staff du tournoi : elles portent les noms des
joueurs.

## Où sont les boutons

| Page | Boutons |
| --- | --- |
| `…/organizer/rounds/[roundId]/matches` | **Feuilles de match**, **Liste (impression)**, **Liste (CSV)** — portée : la ronde |
| `…/organizer/rounds` | **Liste (impression)**, **Liste (CSV)** — portée : tout le tournoi |

Le composant `MatchExportActions` rend ces boutons ; `roundId` détermine la
portée et l'affichage du bouton des feuilles de match (il n'a pas de sens au
niveau du tournoi).

## Feuilles de match

Page `…/organizer/rounds/[roundId]/matches/print`.

Une feuille par match, **deux feuilles par page A4**, chacune insécable. Chaque
feuille porte :

- le nom du tournoi, la phase et le numéro de ronde ;
- le **numéro de table** en gros ;
- une grille du best-of : une ligne par partie, une colonne par joueur, plus une
  ligne « parties gagnées ». L'intitulé de la première colonne suit le mode de
  résultat de la phase (« Partie » en mode sélection, « Points » en mode points) ;
- une ligne de résultat final et une case de signature par joueur.

Les **BYE sont exclus** : sans adversaire, il n'y a rien à remplir ni à faire
signer. Une ronde entièrement composée de BYE affiche un message plutôt qu'une
page blanche.

## Liste des matchs

- **Impression** : page `…/organizer/matches/print`, avec un `?roundId=` facultatif
  pour se limiter à une ronde. Tableau phase / ronde / table / joueurs / score /
  statut, groupé par ordre de phase puis de ronde.
- **CSV** : `GET /api/tournaments/[tournamentId]/matches/export`, avec le même
  paramètre `roundId` facultatif.

### Format du CSV

Séparateur `;` et **BOM UTF-8** : c'est ce qu'attend Excel en configuration
française, où une virgule casserait les colonnes et l'absence de BOM les accents.

Colonnes : `Phase ; Ronde ; Table ; Statut ; Joueur 1 ; Parties 1 ; … ; Vainqueur(s)`.
Le nombre de colonnes joueur s'adapte au match le plus peuplé de l'export : les
phases multijoueurs dépassent les deux joueurs habituels, un BYE laisse les
colonnes suivantes vides.

Les valeurs textuelles commençant par `=`, `+`, `-`, `@` ou une tabulation sont
préfixées d'une apostrophe : un pseudo est saisi librement, et sans cette
neutralisation Excel ou LibreOffice l'exécuteraient comme une formule à
l'ouverture du fichier. L'apostrophe n'apparaît pas dans la cellule.

Nom du fichier : dérivé du nom du tournoi (`coupe-d-ete-matchs.csv`,
`coupe-d-ete-ronde-3-matchs.csv`).

## Impression

Les pages destinées au papier sont des surcouches plein écran (même principe que
la page minuteur) qui recouvrent le chrome du site à l'écran. Les règles
d'impression vivent dans `app/globals.css` :

- `@page` fixe le format A4 et des marges de 12 mm ;
- `[data-print-hidden]` disparaît à l'impression — en-tête du site, pied de page,
  décorations saisonnières, barre d'actions des pages d'impression ;
- `[data-print-page]` est remis dans le flux : une boîte `fixed` ne sortirait que
  sur la première page.

L'aperçu d'impression s'ouvre automatiquement à l'arrivée sur la page (ces pages
n'ont pas d'autre usage), et un bouton **Imprimer** permet de le rouvrir. Le
rendu est figé en noir sur blanc, quel que soit le thème de l'utilisateur.

Il n'y a pas de génération de PDF côté serveur : « Enregistrer en PDF » depuis la
boîte de dialogue du navigateur produit le même résultat sans dépendance
supplémentaire.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `lib/tournaments/match-export.ts` | Mise à plat des matchs (tri, libellés, score) et génération du CSV |
| `app/api/tournaments/[tournamentId]/matches/export/route.ts` | Téléchargement du CSV |
| `app/tournaments/[tournamentId]/organizer/MatchExportActions.tsx` | Les boutons |
| `app/tournaments/[tournamentId]/organizer/PrintShell.tsx` | Cadre commun des pages d'impression |
| `app/tournaments/[tournamentId]/organizer/rounds/[roundId]/matches/print/**` | Feuilles de match |
| `app/tournaments/[tournamentId]/organizer/matches/print/page.tsx` | Liste imprimable |
| `lib/db/tournaments.ts` | `listMatchesByTournament` (tous les matchs du tournoi) |

## Traductions

Sous-namespace `Tournaments.matchExport` dans `messages/{fr,en,it,de}.json`.
