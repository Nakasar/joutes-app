# Départage des égalités

Les règles qui séparent deux joueurs à égalité de points sont désormais lisibles
et modifiables depuis la configuration du tournoi, au lieu d'être déduites du
preset du jeu sans que rien ne l'affiche.

## Principes

- **La chaîne affichée est la chaîne appliquée.** L'organisateur lit dans la
  configuration l'ordre exact que le classement suivra, statistiques du jeu
  comprises. La page ne redit pas la règle avec ses mots : elle rejoue la même
  résolution que le serveur (`resolveTiebreakers`), à partir des mêmes presets.
- **Le jeu propose, l'organisateur dispose.** Une phase suit les départages
  officiels de son preset tant que personne n'y touche. Le champ n'est
  enregistré que s'il s'en écarte : une phase laissée telle quelle continue de
  suivre le jeu, y compris si ses règles officielles évoluent.
- **On ne propose que ce qu'on sait calculer.** Les critères offerts sont les
  statistiques relevées par le preset de la phase, plus ceux qui ne dépendent
  d'aucun jeu. Un critère qu'on ne calcule pas n'apparaît nulle part — pas même
  grisé : mieux vaut une liste courte qu'une règle qu'on croit appliquée.
- **Les points de match ne sont pas un départage.** Ils sont le classement, et
  passent donc toujours avant la chaîne. Ils sont affichés en premier, figés.

## Critères supportés

| Clé | Nom | Calcul |
| --- | --- | --- |
| `omw` | Résistance (OMW%) | Moyenne du taux de victoire des adversaires rencontrés. |
| `gamesDiff` | Différence de parties | Parties gagnées moins parties perdues. |
| `gamesWon` | Parties gagnées | Total des parties gagnées. |
| `stat:<clé>` | Statistique du preset | Cumul de la statistique relevée à chaque partie (score de bataille, cartes de lutte, touchdowns…). Le plus grand total devant. |

Tous se lisent « le plus grand d'abord », une valeur absente comptant pour zéro.
Les trois premiers sont listés dans `GENERIC_TIEBREAKERS`
(`lib/types/Tournament.ts`, à côté du type qu'ils habitent) : un critère ajouté
là est aussitôt proposé à l'organisateur et accepté par l'API — l'interface et
le schéma de validation s'y adossent tous deux, sans recopier la liste. Reste à
lui donner son calcul dans `compareByTiebreakers` et son libellé dans les quatre
locales.

Ces constantes vivent avec le type plutôt qu'avec le catalogue des presets :
l'interface d'organisation en a besoin, et le bundle client n'a pas à embarquer
les réglages de tous les jeux pour afficher une liste de critères.

Le **temps de puzzle** reste hors de cette chaîne : il tranche en dernier, après
tous les critères, et n'est pas configurable. Hors phase puzzle il n'a aucun
effet (personne n'a de temps) ; dans une phase puzzle, où rien d'autre ne
distingue les joueurs, il fait tout le classement — il n'y a donc rien à régler.

## Réglage de phase

| Réglage | Effet |
| --- | --- |
| `tiebreakers` | Chaîne appliquée après les points de match, dans cet ordre. Absent = celle du preset de la phase, ou la chaîne historique (`omw` → `gamesDiff` → `gamesWon`) sans preset. |

- Un **tableau vide** est un choix valide : aucun départage, les ex æquo le
  restent. C'est différent d'un champ absent, qui veut dire « suis le jeu ».
- `PATCH` avec `tiebreakers: null` rend la phase aux départages de son preset.
- Changer de preset de statistiques réinitialise la chaîne sur celle du nouveau
  jeu, comme cela réinitialise déjà l'exigence de saisie.
- Un critère devenu incalculable — statistique d'un preset retiré de la phase
  depuis — est écarté au calcul comme à l'affichage, sans migration : il ne
  comparerait plus que des zéros et resterait affiché comme une règle appliquée.

## Où c'est appliqué

`calculateMultiplayerStandings` reçoit la chaîne résolue à trois endroits, tous
dans `lib/db/tournaments.ts` :

- la génération des rondes (appariement, seeding, qualification du top cut) ;
- `getStandings` (classement courant d'une phase ou du tournoi) ;
- la validation d'une ronde, qui fige le classement dans le document de ronde.

Pour le classement d'ensemble d'un tournoi, `resolveStandingsRules` retient la
phase qui gouverne déjà les colonnes de statistiques — la dernière à déclarer un
preset — et prend sa chaîne : les colonnes et l'ordre qui les exploite viennent
ainsi toujours de la même phase.

Les classements déjà figés ne sont pas recalculés : modifier la chaîne d'une
phase démarrée n'agit que sur les classements calculés ensuite. L'édition d'une
phase reste de toute façon réservée aux phases non démarrées.

## Interface

`app/tournaments/[tournamentId]/organizer/` :

- `phaseTiebreakers.ts` — résolution et libellés partagés entre le formulaire et
  la liste des phases.
- `PhaseForm.tsx` — bloc « Départage des égalités » : les points de match en
  tête (figés), puis la chaîne numérotée, chaque critère montant, descendant ou
  se retirant, et les critères inutilisés proposés à l'ajout. Un bouton rétablit
  les règles du jeu dès que la chaîne s'en écarte.
- `PhasesSection.tsx` — rappel de la chaîne sous le résumé de chaque phase.

Le bloc disparaît sur une phase puzzle : sans point ni partie, aucun de ces
critères n'y départage quoi que ce soit.

## Tests

```bash
npm run test
```

- `lib/tournaments/game-presets.test.ts` — critères proposés selon le preset,
  chaîne absente qui suit le jeu, chaîne vide respectée, statistique étrangère
  écartée.
- `lib/tournaments/standings.test.ts` — une chaîne choisie renverse l'ordre que
  donnaient les départages du preset.
