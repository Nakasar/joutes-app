# Leagues and Tournaments

## Vue d'ensemble

Organiser des leagues étalées dans le temps et des tournois sur la plateforme Joutes.

## Pages

- `/leagues` - Liste des ligues publiques avec filtres et recherche
- `/leagues/new` - Création d'une nouvelle ligue
- `/leagues/:leagueId` - Détails d'une ligue (classement, règles, inscription)
- `/leagues/:leagueId/manage` - Gestion d'une ligue (pour les organisateurs), avec
  l'onglet « Tournois » des tournois rattachés
- `/tournaments/new?leagueId=:leagueId` - Création d'un tournoi au nom d'une ligue

## Modèle de données

### Type League

```typescript
type League = {
  id: string;
  name: string;
  description?: string;
  banner?: string;

  // Un tournoi rattaché porte `leagueId` (voir lib/types/Tournament.ts) ;
  // la ligue ne tient pas la liste inverse.
  
  format: 'KILLER' | 'POINTS';
  killerConfig?: KillerConfig;
  pointsConfig?: PointsConfig;
  
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  
  status: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  
  creatorId: string;
  organizerIds: string[];
  participants: LeagueParticipant[];
  
  maxParticipants?: number;
  minParticipants?: number;
  isPublic: boolean;
  invitationCode?: string;
  
  gameIds: string[];
  lairIds: string[];
  
  createdAt: Date;
  updatedAt: Date;
};
```

## Paramètres généraux

- `format: 'KILLER' | 'POINTS'` : format de ligue.
- Liste de participants (users) avec leurs points, l'historique de leurs points et de leurs hauts faits.
- Liste de lieux partenaires de la ligue (lairs).
- Liste des jeux de la ligue.

### Formats de leagues :

#### Killer

`format: 'KILLER'`

Les ligues de format "KILLER" fonctionnent par cibles à affronter.

Paramètres :
- `targets: number` (default: 1) : Le nombre de cibles en parallèle attributées aux participants.
- `requireLair: boolean` (default: true) : les matchs doivent être confirmés par le lieu où ils se déroulent.
- `eliminateOnDefeat: boolean` (default: false) : lors d'une défaite, le joueur est éliminé de la ligue.


Fonctionnement :
- Un joueur peut s'inscrire à la ligue.
- En cliquant sur un bouton "Obtenir mes matchs", le système détermine les cibles du joueur. Les règles pour les cibles sont les suivantes :
  - L'adversaire est sélectionné parmis les utilisateurs qui suivent un lieu participant de la ligue qui est en commun pour les deux joueurs. Si plusieurs lieux sont éligibles, un lieu est tiré au sort.
  - Idem pour le jeu, les deux joueurs doivent suivre le jeu faisant partie de la ligue.  Si plusieurs jeux sont éligibles, un jeu est tiré au sort.
  - L'adversaire ne doit pas avoir déjà été affronté sur ce jeu (mais il peut être affronté sur d'autres jeux).
- Les joueurs peuvent renseigner le résultat du match. Auquel cas le résultat doit être confirmé par l'adversaire et un owner du lieu où le match s'est déroulé (si requireLair est true). Utilise des notifications pour signaler qu'un match attend confirmation (auprès de l'adversaire et auprès des owners du lieu).

#### Points

`format: 'POINTS'`

Les leagues de format 'POINTS' fonctionnent par points accumulés lors des évènements et parties qui composent la league.

Paramètres:
- `pointsRules: object` with 
  - `participation: number` (default: 0) : par match, de ligue comme de tournoi
  - `victory: number` (default: 2)
  - `defeat: number` (default: 1)
  - `draw: number` (default: la valeur de `defeat`) : uniquement quand aucun vainqueur n'est désigné
  - `rankPoints: number[]` (default: []) : points par rang final d'un tournoi rattaché, index 0 = 1er
  - `rankPointsBeyond: number` (default: 0) : points des rangs au-delà de `rankPoints`
  - `feats: array` (default: [])
    - `title: string` : titre du haut-fait
    - `points: number` (default: 1) : points rapportés par le haut fait
    - `maxPerEvent?: number` (default: 1)
    - `maxPerLeague?: number` (default: undefined)

Le même barème sert aux matchs de ligue et aux tournois rattachés : un point
gagné vaut la même chose quel que soit le chemin qui l'a produit.

**Compatibilité.** Les ligues créées avant l'arrivée des tournois rattachés
n'ont en base ni `draw` ni table de rangs. Aucune migration : le barème est
complété à la lecture par `normalizePointsRules` (`lib/leagues/points-rules.ts`),
appelé dans `toLeague`. Une ligue existante continue donc de marquer exactement
comme avant tant que l'organisateur ne touche pas à sa configuration.

C'est pour cela que `draw` absent vaut `defeat` et non une valeur décidée
d'avance : avant, un match sans vainqueur payait `defeat` à tout le monde.
Poser 1 par défaut aurait déplacé le classement de toute ligue réglée avec
`defeat: 0`. Les nouvelles ligues, elles, reçoivent la valeur du formulaire.

**Match nul.** `draw` ne s'applique que lorsque `winnerIds` est vide. Des
co-vainqueurs — ce que produit une égalité de score sur un match de ligue —
restent des vainqueurs : les compter comme un nul réécrirait le classement de
toutes les ligues en cours au premier recalcul.

## Tournois rattachés

Un organisateur de ligue peut créer un tournoi au nom de sa ligue
(`/tournaments/new?leagueId=…`, depuis l'onglet « Tournois » de la gestion) ou
rattacher un tournoi existant. Le tournoi porte alors un `leagueId`
(`lib/types/Tournament.ts`). Seules les ligues au format POINTS, ni terminées ni
annulées, peuvent en accueillir.

**Droits.** *Rattacher* demande d'être **à la fois** organisateur du tournoi et
organisateur de la ligue : on engage le classement d'autrui. *Détacher* se fait
des deux côtés, chacun avec ses propres droits — l'organisateur du tournoi
depuis les réglages du tournoi, l'organisateur de la ligue depuis l'onglet
« Tournois ». Personne n'est retenu de force dans une ligue.

### Ce que la clôture apporte

À la clôture (`status` du tournoi → `completed`), quatre sources de points, une
ligne d'historique par source :

1. **Rang final** — `rankPoints[rang - 1] ?? rankPointsBeyond`, où le rang est la
   position au classement du tournoi, celle qu'affiche la salle. Un joueur qui a
   abandonné n'y a pas droit ; il garde le reste.
2. **Bilan** — `victoires × victory + nuls × draw + défaites × defeat`. Un BYE
   compte comme une victoire, comme au classement du tournoi.
3. **Participation** — `participation` par match compté au classement.
4. **Hauts faits** décernés pendant le tournoi (voir plus bas).

Les joueurs pré-inscrits qui ne se sont pas présentés sont exclus. Les joueurs
ayant un compte et absents de la ligue y sont **inscrits automatiquement** ; les
invités sans compte ne sont crédités de rien et sont récapitulés à
l'organisateur, qui voit aussi les points qu'ils auraient marqués.

### Annuler et rejouer

**Appliquer commence toujours par annuler.** Clôturer deux fois, corriger un
résultat puis reclôturer, changer le barème puis rejouer : tout converge vers le
même état. Rouvrir un tournoi clos, le détacher ou le supprimer retire sa
contribution ; supprimer la ligue détache ses tournois.

Un échec de la contribution est rapporté dans la réponse du `PATCH`
(`leagueError`) sans annuler le changement de statut : le tournoi est bien clos,
et l'organisateur peut rejouer sans risque.

### Invariant

Une ligne d'historique produite par un tournoi porte `tournamentId` et **jamais**
`matchId`. `matchId` désigne un match de ligue et sert de clé à
`recalculateLeaguePoints` ; le réutiliser ferait effacer la contribution du
tournoi au premier recalcul. Symétriquement, `recalculateLeaguePoints` recopie
les lignes de tournoi telles quelles — c'est pourquoi
`recalculateLeaguePointsAction` rejoue ensuite chaque tournoi clos, sans quoi un
barème modifié ne s'appliquerait qu'aux matchs.

Les points et hauts faits venus d'un tournoi ne sont pas supprimables depuis la
ligue : ils se retirent depuis le tournoi, sinon la prochaine application les
réécrirait à l'identique.

### Hauts faits décernés en tournoi

Quand un tournoi est rattaché, l'interface d'organisation propose un bouton
« Hauts faits » à deux endroits :

- sur la **fiche d'un joueur**, à côté des notes internes ;
- dans la **saisie du résultat d'un match**, une ligne par joueur.

Le catalogue est celui de la ligue (`pointsConfig.pointsRules.feats`) : rien ne
s'affiche sur un tournoi autonome. Les attributions vivent dans la collection
`tournament-feat-awards` jusqu'à la clôture — l'organisateur peut donc encore se
raviser sans toucher au classement de la ligue. L'arbitrage peut décerner
(`assertCanManage`), le rattachement non (`assertIsOrganizer`).

`maxPerEvent` s'applique par match de tournoi pour les attributions liées à un
match, et globalement au tournoi pour celles faites depuis une fiche joueur.
`maxPerLeague` tient compte de ce que le joueur détient déjà ailleurs dans la
ligue. Un haut fait au-delà d'une limite reste enregistré mais n'est pas compté,
et l'organisateur en est informé au moment de la clôture.

Quand `maxPerLeague` ne suffit pas pour tout le monde, **le tournoi passe avant
le match de ligue** : un recalcul rejoue d'abord les matchs en opposant les
hauts faits déjà acquis en tournoi, puis réapplique les tournois. L'ordre est
arbitraire mais stable, ce qui compte davantage — deux recalculs successifs
donnent le même classement.

Les limites sont indiquées dans l'interface mais **jamais bloquantes** : c'est
le calcul de la clôture qui tranche, avec l'état réel de la ligue sous les yeux.

## Fonctionnalités implémentées

### Pour les utilisateurs
- Consulter les ligues publiques
- S'inscrire/se désinscrire d'une ligue
- Voir le classement et les règles d'une ligue
- Rejoindre une ligue privée via code d'invitation

### Pour les organisateurs
- Créer une ligue (POINTS ou KILLER)
- Configurer les règles de points et les hauts faits
- Gérer le statut de la ligue (DRAFT → OPEN → IN_PROGRESS → COMPLETED)
- Ajouter/retirer des participants
- Attribuer des points manuellement
- Attribuer des hauts faits aux participants
- Créer un tournoi rattaché à la ligue, ou en rattacher un existant
- Décerner des hauts faits pendant un tournoi rattaché
- Supprimer une ligue

## Fichiers

- `lib/types/League.ts` - Types TypeScript
- `lib/db/leagues.ts` - Fonctions d'accès à la base de données
- `app/leagues/actions.ts` - Server actions
- `app/leagues/page.tsx` - Page de liste
- `app/leagues/new/page.tsx` - Page de création
- `app/leagues/[leagueId]/page.tsx` - Page de détails
- `app/leagues/[leagueId]/manage/page.tsx` - Page de gestion

### Tournois rattachés

- `lib/leagues/points-rules.ts` - Barème : valeurs par défaut, lecture tolérante,
  issue d'un match. Module pur, testé.
- `lib/leagues/tournament-scoring.ts` - Ce qu'un tournoi rapporte à sa ligue.
  Module pur sans accès base, testé : un barème faux ne se voit jamais à l'écran,
  le classement a toujours l'air plausible.
- `lib/leagues/tournament-results.ts` - Orchestration (appliquer / annuler). Seul
  module à lire les deux domaines, ce qui évite un cycle d'import entre
  `lib/db/leagues.ts` et `lib/db/tournaments.ts`.
- `app/api/tournaments/[tournamentId]/route.ts` - Le `PATCH` qui clôt, rouvre,
  rattache ou détache : le seul point d'accroche.
- `app/api/tournaments/[tournamentId]/players/[playerId]/feats/` - Attribution et
  retrait des hauts faits (calqué sur les notes internes).
- `app/tournaments/[tournamentId]/FeatAwardPicker.tsx` - Sélecteur partagé par la
  fiche joueur et la saisie de match.
