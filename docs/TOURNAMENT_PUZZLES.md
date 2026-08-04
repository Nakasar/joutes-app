# Phases de puzzle

Support des puzzles dans le moteur de tournoi : une phase où personne n'affronte
personne. Tous les joueurs résolvent le même puzzle en même temps, et le
classement se fait au temps mis pour le terminer, le plus rapide en tête.

## Principes

- **Le type de phase s'appelle `time-race`, la fonctionnalité s'appelle
  « puzzle ».** La valeur stockée est volontairement générique : d'autres
  épreuves au chronomètre pourront s'y ranger sans migration. Le puzzle est le
  premier — et pour l'instant le seul — format qu'elle porte, et c'est ce nom
  que voient les organisateurs et les joueurs.
- **Un puzzle n'est pas un match.** Une phase puzzle ne génère ni appariement,
  ni table, ni match : il n'y a rien à apparier. Elle porte une ronde unique,
  vide, qui ne sert qu'à l'ancrer dans le déroulé du tournoi.
- **Le chronomètre remplace le minuteur, il ne le remplace pas dans la base.**
  Le tournoi porte désormais deux horloges (`timer` et `stopwatch`) : un
  tournoi enchaîne des phases puzzle et des phases classiques, et la durée de
  ronde réglée ne doit pas se perdre en route. C'est le type de la phase en
  cours qui décide laquelle est affichée, partout.
- **Un temps est un résultat, pas un état d'affichage.** Remettre le
  chronomètre à zéro ne touche à aucun temps déjà relevé.
- **Le temps départage en dernier.** Il ne renverse jamais des points de match
  gagnés dans une phase précédente ; mais dans une phase puzzle, où tout le
  reste vaut zéro, il fait tout le classement.

## Configuration d'une phase

Type de phase `time-race`. Le formulaire de phase masque tout ce qui décrit un
affrontement (best-of, mode de résultat, scoring, appariement, bornes de joueurs
par match, rythme, preset de statistiques). Restent :

| Réglage | Effet |
| --- | --- |
| `name` | Nom de la phase. |
| `topCut` | Joueurs qualifiés à l'entrée de la phase, comme ailleurs. |
| `scenarios` | Le premier scénario décrit le puzzle à résoudre ; il est affiché aux joueurs (nom, et consignes après le « \| »). |

Une phase de puzzle n'accepte qu'une seule ronde : plusieurs puzzles se
configurent en plusieurs phases, chacune avec son chronomètre.

## Chronomètre

`Tournament.stopwatch` — `{ running, startedAt?, elapsedSeconds? }`. Comme le
minuteur, il est diffusé par `GET /api/tournaments/:id/live` avec l'horloge
serveur (`serverNow`), et chaque poste recalcule le même temps écoulé malgré son
propre décalage d'horloge.

`POST /api/tournaments/:id/stopwatch` (organisateurs) — `start`, `pause`,
`resume`, `reset`. Il n'y a pas de durée à fournir : il part toujours de 0.
`reset` le ramène à l'état « jamais lancé », et non à une pause à 00:00 : les
deux sont arrêtés, mais seul le second propose « Reprendre » et autorise le
relevé d'un temps.

Le chronomètre s'affiche à la place du minuteur sur l'écran de projection, la
page plein écran, l'en-tête du portail joueur et la carte du tournoi en direct,
dès que la phase en cours est une phase puzzle (`phaseType` sur `/live`).

## Relevé des temps

Collection `tournament-puzzle-results`, un document par (phase, joueur), avec un
index unique sur ce couple : deux enregistrements concurrents ne peuvent pas
créer deux temps pour le même joueur.

| Route | Qui | Effet |
| --- | --- | --- |
| `GET /api/tournaments/:id/phases/:phaseId/puzzle-results` | staff et joueurs | Temps relevés, du plus rapide au plus lent. |
| `POST .../puzzle-results` | staff, ou joueur si `allowSelfReporting` | Relève le temps courant du chronomètre. Le staff désigne le joueur (`playerId`) et peut fournir un `durationSeconds` ; un joueur ne se rapporte que lui-même, sans choisir son temps, et une seule fois. |
| `PATCH .../puzzle-results/:playerId` | staff | Corrige le temps enregistré. |
| `DELETE .../puzzle-results/:playerId` | staff | Retire le temps : le joueur redevient « non terminé ». |

Côté organisateur, tout se fait depuis **Puzzle** (barre latérale, visible
seulement si le tournoi comporte une phase puzzle) : le chronomètre en haut, la
liste des joueurs en dessous, un bouton « Terminé » par ligne. La section
apparaît aussi pour une phase puzzle déjà close, pour corriger un temps après
coup.

Côté joueur, la carte de match cède la place au chronomètre et au bouton
« J'ai terminé le puzzle » quand le self-reporting est activé ; sinon, un
message dit que l'organisation relèvera le temps.

## Classement

`calculateMultiplayerStandings` reçoit les temps par joueur et les expose sur
`PlayerStanding.puzzleTimeSeconds`. Le tri applique, dans l'ordre : points de
match, départages du preset, puis le temps de puzzle — croissant, un joueur sans
temps passant derrière tous ceux qui ont terminé.

Le temps apparaît en colonne dès qu'un joueur en a un : classement organisateur,
historique par ronde (portail joueur), export CSV, et écran de projection, où il
remplace alors les points et le bilan.

Sur le classement d'ensemble d'un tournoi enchaînant plusieurs puzzles, les
temps sont cumulés. Ce cumul porte aussi le seeding d'entrée et le top cut de la
phase suivante : après une phase puzzle, c'est le seul critère qui distingue les
joueurs.
