# Formats de tournoi pour les jeux de figurines

Ouverture du moteur de tournoi aux formats des jeux de figurines, à partir des
règles officielles de la ligue *Star Wars™: Shatterpoint* (Atomic Mass Games,
31/03/25). Le moteur existant — phases, appariement suisse, classement, portails
organisateur et joueur — n'est pas forké : il gagne des réglages.

## Principes

- **Une ligue est un tournoi suisse qui prend son temps.** Plutôt qu'un nouveau
  type de phase, le rythme devient un réglage : une phase se joue « sur place »
  (minuteur et tables, comportement historique) ou « par intervalles » (chaque
  ronde court sur plusieurs jours, les joueurs planifient leur partie).
- **Un jeu apporte ses règles de départage, pas l'organisateur.** Les
  statistiques de match et l'ordre des départages viennent d'un preset livré
  avec le jeu. L'organisateur choisit de l'appliquer, il ne le rédige pas.
- **Un match non joué n'est pas un match nul.** L'écart est invisible à l'écran
  et décisif au classement : il est porté par un champ dédié.

## Réglages ajoutés à une phase

| Réglage | Effet |
| --- | --- |
| `pacing` | `live` (défaut) ou `asynchronous`. En asynchrone, chaque ronde porte une échéance et n'a ni minuteur ni numéros de table. |
| `intervalHours` | Durée d'un intervalle. Saisie en jours dans l'interface, une semaine par défaut. |
| `deadlineResolution` | Sort des matchs sans résultat à la clôture : `double-loss` (défaut) ou `manual`. |
| `swissPairing` | `ranked` (défaut, ordre du classement) ou `random-in-bracket` (tirage au sort dans chaque groupe de points, règle des ligues officielles). |
| `statsPresetKey` | Preset de statistiques du jeu. Absent = aucune statistique relevée, départages historiques. |
| `requireMatchStats` | Saisie des statistiques exigée pour rapporter un résultat. Défaut `false`, sans effet sans preset. |
| `scenarios` | Pool de scénarios attribués aux rondes dans l'ordre, en boucle. |

## Presets de jeu — `lib/tournaments/game-presets.ts`

Un preset décrit ce qu'un jeu relève à chaque partie et comment il départage.
Table en dur, sur le modèle de `PARSABLE_GAME_SLUGS` dans
`lib/tournaments/decklist-parsing.ts` — seul autre point de branchement par jeu
du code tournoi.

| Preset | Jeux | Statistiques | Départages |
| --- | --- | --- | --- |
| `swp-league` | `shatterpoint` | Cartes de lutte revendiquées (bye : 2), blessures infligées (bye : 3) | lutte → blessures → OMW% |
| `battle-points` **(défaut)** | `w40k`, `warhammer`, `legion` | Score de bataille (bye : 100), score de destruction (bye : 0) | bataille → OMW% |
| `victory-points` | `w40k`, `warhammer`, `legion` | Points de victoire | PV → OMW% → diff. de parties |
| `blood-bowl` | `bb` | Touchdowns (bye : 2), sorties adverses | TD → sorties → OMW% |

Les statistiques **ne désignent jamais le vainqueur** : c'est le jeu qui le
désigne (`resultMode: "selection"`). Elles sont saisies partie par partie, en
plus du résultat, et servent au classement.

Un preset porte aussi des valeurs par défaut proposées à la création d'une
phase (barème, mode d'appariement, best-of, saisie obligatoire). Un preset
retiré d'une version à l'autre ne casse rien : le classement retombe sur les
départages historiques et les résultats déjà rapportés sont conservés.

## Jeux de figurines à grande armée — `battle-points`

Warhammer, Warhammer 40 000 et Star Wars: Legion relèvent deux scores à chaque
partie, ceux que les joueurs tiennent déjà sur leur feuille de match :

- le **score de bataille** (« battle points »), marqué sur les objectifs de la
  mission — c'est lui qui départage ;
- le **score de destruction** (« points destroyed »), la valeur en points de
  l'armée adverse détruite — conservé pour l'historique du tournoi, il n'entre
  dans aucun départage.

Départage complet, dans l'ordre : **points de tournoi** (victoires, nuls,
défaites selon le barème de la phase — appliqués avant toute chaîne de preset
par `calculateMultiplayerStandings`), puis **score de bataille**, puis
**résistance** (OMW%, moyenne du taux de victoire des adversaires rencontrés).

C'est le preset retenu d'office (`applyByDefault`) à la création d'une phase
pour ces jeux, avec la saisie exigée : `victory-points`, plus léger, reste
disponible dans la liste pour les formats maison. Un tournoi qui n'en veut pas
choisit « Aucune » comme avant.

### Saisie obligatoire

`requireMatchStats` fait de la saisie une condition du résultat, plutôt qu'une
case qu'on remplira « plus tard » — un score de bataille manquant fausse le
départage de tout le tableau, et ne se rattrape pas une fois la ronde close.

- Le domaine refuse un rapport dont une partie ne porte pas **toutes** les
  statistiques pour **tous** les joueurs du match. Les valeurs absentes ne sont
  pas complétées à zéro : un zéro se lirait comme un score réellement rapporté.
- Les raccourcis de score (« j'ai gagné », « 2-1 ») disparaissent des deux
  portails et de l'application mobile : ils ne savent pas porter de
  statistiques. La saisie détaillée devient le seul chemin, et son bouton reste
  désactivé tant qu'une case manque.
- Un BYE et un forfait échappent à l'exigence : personne n'a joué, ce sont les
  valeurs de bye du preset qui s'appliquent.

### Historique

Les scores relevés se retrouvent partout où le tournoi se relit :
partie par partie dans l'historique des rondes, cumulés en colonnes du
classement (à l'écran et dans le CSV de classement), et par joueur dans le CSV
des matchs — une colonne par statistique et par joueur du match.

## Intervalles

Une ronde asynchrone porte `opensAt` et `deadlineAt`, posés à sa création
(`createNextRound`). Les joueurs appariés qui ont un compte reçoivent une
notification : contre qui ils jouent, jusqu'à quand, et le scénario le cas
échéant.

L'organisateur dispose de deux gestes depuis le bandeau de ronde :

- **prolonger l'intervalle** (`set-deadline`) — le document laisse
  explicitement l'organisateur accorder du temps ;
- **clore l'intervalle** (`close-deadline`) — applique `deadlineResolution` aux
  matchs restés sans résultat, puis termine la ronde.

Le cron horaire `/api/cron/tournament-deadlines` relance les joueurs dont le
match n'a pas de résultat à moins de 24 h de l'échéance, et prévient
l'organisation quand l'échéance est franchie. Il **ne clôt jamais** une ronde :
la décision entre double défaite, forfait et délai supplémentaire appartient à
l'organisateur.

## Matchs non joués

`TournamentMatch.resolution` vaut `played` (défaut), `forfeit` ou
`double-loss`.

- **Forfait** — un joueur l'emporte sans jouer parce que l'adversaire est resté
  injoignable. Il est crédité comme s'il avait reçu un bye : victoire nette du
  best-of et statistiques de bye du preset. C'est le « scored as a bye » du
  document.
- **Double défaite** — l'intervalle a expiré sans partie, les deux joueurs
  perdent. `winnerIds` est vide, comme pour un match nul : sans `resolution`,
  les deux cas seraient indiscernables au classement.

Les deux se prononcent depuis la saisie détaillée d'un match, côté organisation
uniquement (`PATCH …/matches/:matchId` avec `{ action: "forfeit", winnerId }`).

## Appariement

`generateSwissPairings` prend désormais un objet d'options
(`rankedOrder`, `mode`, `matchPointsOf`, `playersWithBye`).

- Le **bye est attribué avant tout appariement**, au moins bien classé n'en
  ayant pas encore reçu. Auparavant il échoyait mécaniquement au dernier joueur
  non apparié, qui n'est pas forcément celui qui doit le recevoir.
- En mode `random-in-bracket`, les joueurs sont regroupés par points de
  classement, chaque groupe est mélangé, et les groupes restent ordonnés par
  points décroissants : le joueur en trop d'un groupe impair descend
  naturellement au groupe suivant.

## Listes d'armée

Aucun développement dédié : le **formulaire d'inscription personnalisé** couvre
le besoin. Une question en texte long intitulée « liste d'armée », avec
`playerEditable` activé et sans date limite, permet de déposer un roster et de
le modifier entre les rondes — exactement ce qu'autorise le règlement
Shatterpoint. L'analyse de liste ne s'applique qu'aux jeux de cartes
(`gameSupportsDecklistParsing`) ; ailleurs la saisie est conservée telle quelle.

## Points d'attention

- **Les statistiques n'existent que si la phase a un preset.** Un rapport de
  résultat portant des statistiques sur une phase sans preset est refusé, plutôt
  qu'ignoré silencieusement.
- **La clôture d'un intervalle refuse d'écraser un résultat.** Un match rapporté
  mais non confirmé, ou contesté, doit être arbitré avant : seuls les matchs
  restés `pending` deviennent des doubles défaites.
- **Le calcul du classement a quitté `lib/db/tournaments.ts`** pour
  `lib/tournaments/standings.ts`, module pur et testé. La persistance n'y entre
  plus.
- **Les presets sont dupliqués côté mobile** (`src/lib/tournament-presets.ts`),
  comme les autres portages délibérés du client. Toute modification de la table
  doit être reportée dans les deux dépôts.

## Tests

Premiers tests du dépôt, exécutés par le runner intégré de Node (aucune
dépendance ajoutée) :

```bash
npm run test
```

- `lib/utils/pairing.test.ts` — rotation des byes, évitement des re-matchs,
  tirage au sort dans un groupe de points.
- `lib/tournaments/standings.test.ts` — double défaite ≠ match nul,
  statistiques de bye et de forfait, chaîne de départage (dont points de
  tournoi → score de bataille → résistance).
- `lib/tournaments/game-presets.test.ts` — preset retenu d'office par jeu,
  complétude des statistiques exigées (un zéro est une valeur saisie).

`scripts/ts-paths-hook.mjs` résout l'alias `@/` et les imports sans extension
pour `node --test`.
