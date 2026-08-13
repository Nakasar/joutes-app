# Fonctionnalité : Rapports de Bataille

## Vue d'ensemble

Un **rapport de bataille** est une partie (`game-matches`) racontée à la manière
des jeux de figurines : ce qui compte n'y est pas le deck joué mais la **liste
d'armée posée sur la table**, le **scénario** joué et le **récit** qu'on en fait.

La fonctionnalité vise en premier lieu les jeux comme Star Wars: Shatterpoint,
mais rien n'y est propre à un jeu : un rapport de bataille reste une partie
ordinaire, avec ses joueurs, sa date, son lieu, ses vainqueurs, ses notes et son
vote MVP. Le rapport n'est qu'un **volet supplémentaire** de la partie.

## Ce que contient un rapport

| Élément | Où il vit | Qui l'écrit |
| --- | --- | --- |
| Jeu joué | `gameId` de la partie | Créateur |
| Joueurs | `playerIds` et `guests` de la partie | Créateur (ajout / retrait), chacun peut se retirer |
| Vainqueur(s) | `winnerIds` de la partie | Créateur |
| Liste d'armée par joueur | `battleReport.armies[playerId]` | Chaque joueur pour la sienne, le créateur pour toutes |
| Scénario (champ libre) | `battleReport.scenario` | Créateur |
| Fiche de notes libres | `battleReport.notes` | Créateur |
| Table de jeu et ses instants | `battleReport.map` | Créateur |

Un **invité** (participant sans compte, voir [GAME_MATCHES.md](GAME_MATCHES.md))
tient sa place dans un rapport comme n'importe quel joueur : il aligne une liste
d'armée et pose ses jetons sur la table. Comme il ne se connecte pas, c'est le
créateur qui les tient pour lui.

Le scénario et les notes sont réservés au créateur parce que ce sont les deux
seuls champs **partagés** de la fiche : à plusieurs mains, deux joueurs qui les
écriraient en même temps s'effaceraient l'un l'autre sans le voir. Les listes
d'armée, elles, appartiennent chacune à un joueur — le créateur peut les tenir
aussi, parce que c'est souvent lui qui remplit le rapport pour toute la table.

## Le format d'une partie

**La présence du volet `battleReport` fait de la partie un rapport de bataille**,
même quand il est vide. Le format est choisi à la création et ne dépend pas de ce
qui a déjà été rempli — sans quoi une partie perdrait sa mise en page dès qu'on
effacerait sa dernière note.

Il est posé de deux façons :

- **automatiquement** pour les jeux qui activent la fonctionnalité
  « Rapports de bataille » (`features.battleReports`, réglable depuis
  `/admin/games`). Le formulaire de création n'y laisse alors pas le choix ;
- **à la demande** pour les autres jeux, par un interrupteur du formulaire. Un
  joueur peut vouloir raconter une partie d'un jeu dont le fanion n'est pas
  encore posé, et l'en empêcher n'aurait rien protégé.

Une partie en rapport de bataille ne propose pas de sélecteur de deck : ce qui a
été joué s'y écrit en liste d'armée.

## Les listes d'armée

Une ligne de liste désigne soit une **figurine du catalogue du jeu** (les
produits de type « Figurine », voir [COLLECTION_PRODUCTS.md](COLLECTION_PRODUCTS.md)),
soit une **saisie libre**.

L'autocomplétion propose les figurines du jeu, mais ne s'y substitue pas : un
catalogue est toujours en retard sur la dernière sortie, et une figurine
convertie ou proxifiée n'y figurera jamais. Le bouton « ajouter tel quel »
accepte donc n'importe quel nom, et reste offert même lorsque la recherche
répond.

Le nom de la figurine est **écrit dans le rapport**, et non retrouvé par jointure
à l'affichage : un rapport de bataille est une archive, il doit rester lisible
après le retrait d'un produit du catalogue. C'est déjà la convention des
exemplaires de collection (`CollectionProductDb`).

Deux lignes qui citent le même produit — ou, à défaut de produit, le même nom à
la casse et aux espaces près — sont fusionnées, leurs quantités additionnées.

Bornes de saisie (`lib/battle-reports/army.ts`) : 60 références par liste,
99 figurines par ligne, 120 caractères pour un nom de figurine ou de liste,
200 pour un scénario, 10 000 pour les notes.

## La table de jeu

Une vue de dessus du plateau, sur laquelle on pose le décor et les unités pour
noter leur position approximative — pas un plan d'architecte, un croquis qui se
relit.

### Tout est en centimètres

Le modèle ne connaît que des centimètres, jamais des pixels : une table est un
objet physique, et un socle de 4 cm en occupe toujours la même fraction, que la
carte soit affichée sur un téléphone ou sur un écran de bureau. La `viewBox` du
SVG **est** la table ; l'affichage n'est qu'une mise à l'échelle.

Les dimensions se règlent par rapport. Leur valeur de départ vient du jeu
(`GAME_TABLE_PRESETS`) : 90 × 90 cm pour Shatterpoint, 152 × 112 cm pour
Warhammer 40 000, 183 × 91 cm pour Star Wars: Legion, 120 × 120 cm à défaut. Ce
ne sont que des valeurs de départ — un scénario joué sur une autre surface se
corrige en deux champs.

### Décor et unités

- **Le décor** se pose en trois formes simples — rond, rectangle, triangle —
  redimensionnables à la poignée ou au champ numérique, chacune avec un nom et
  une couleur (noir par défaut).
- **Les unités** sont toujours rondes, à la couleur de leur joueur (modifiable
  par le créateur), et rattachées à une ligne de la liste d'armée de ce joueur.
  Quand la figurine vient du catalogue et porte une image, c'est l'image qui
  remplit le rond et la couleur du joueur ne garde que la bordure.

### Le décor appartient à la table, les unités à l'instant

Un rapport garde une suite d'**instants** (« début de partie », « fin du tour
2 ») qui décrivent les positions des unités et **ce qui s'y est passé**. Le
décor, lui, est posé une fois pour toutes : le recopier dans chaque instant
obligerait à le corriger partout, pour un décor qui ne bouge pas de la partie.

Un nouvel instant part de l'état courant plutôt que d'une table vide : on
capture une évolution, pas un nouveau déploiement — les unités ont bougé de
quelques centimètres, elles n'ont pas été reposées. Ses notes, en revanche, ne
sont pas recopiées : elles racontent un moment précis, pas celui qui suit.
Chaque instant se renomme, se réédite et se supprime ; le dernier restant ne
peut pas l'être.

### Les positions montrent, les notes racontent

Un instant porte des **notes** (1 000 caractères) : la charge qui a tout décidé,
l'objectif pris, le jet raté. Les positions disent où étaient les unités, elles
ne disent pas pourquoi — et c'est le pourquoi qu'on relit un an plus tard.

Plus court que les notes du rapport (10 000 caractères), qui racontent la partie
entière : ici, quelques phrases sur un moment. Les notes s'affichent sous la
table, dans l'instant qu'elles décrivent, pour qui lit le rapport ; celui qui
tient la table les saisit dans son panneau, où elles se relisent au fil de la
frappe.

Une note vide disparaît du document plutôt que d'y rester en chaîne vide, et une
table dont un instant raconte quelque chose n'est **pas** une table vide : un
rapport peut raconter ses instants sans avoir posé une seule figurine, et le
tenir pour vide effacerait le récit.

### Ce qui dépasse est ramené, pas refusé

Un doigt qui glisse au-delà du plateau, une table rétrécie après coup : dans les
deux cas la normalisation ramène le jeton au bord plutôt que de refuser
l'enregistrement. Un rapport ne doit pas devenir inenregistrable parce que son
plateau a changé de taille, et un jeton ne doit pas disparaître avec ce qu'il
documentait.

### Qui dessine

La table est réservée au créateur, pour une raison de plus que le scénario et
les notes : c'est un **dessin unique**. Deux joueurs qui déplaceraient des
jetons dans le même instant n'écraseraient pas seulement un champ l'un de
l'autre — ils repositionneraient toute la partie. Pour la même raison, elle est
écrite d'un bloc (`battleReport.map`) et non champ par champ : ses pièces se
tiennent les unes les autres.

Les autres joueurs voient la même table, sans les poignées ni les panneaux.

## Structure technique

### Types (`lib/types/Match.ts`)

```typescript
type BattleReportArmyUnit = {
  productId?: string;   // Figurine du catalogue ; absent = saisie libre
  name: string;         // Dénormalisé : survit à la disparition du produit
  image?: string;       // Dénormalisée aussi : elle illustre le jeton sur la table
  quantity: number;
};

type BattleReportArmy = {
  name?: string;              // Nom de la liste, tel que le joueur l'appelle
  units: BattleReportArmyUnit[];
};

type BattleReport = {
  scenario?: string;                          // Champ libre
  notes?: string;                             // Fiche de notes
  armies?: Record<User['id'], BattleReportArmy>;
  map?: BattleMap;                            // Table de jeu et ses instants
};

type BattleMap = {
  table: { width: number; height: number };   // En centimètres
  terrain: BattleMapTerrain[];                // Rond, rectangle ou triangle
  snapshots: BattleMapSnapshot[];             // Positions et récit, instant par instant
  playerColors?: Record<User['id'], string>;
};
```

`GameTypeMatch` porte le champ `battleReport?: BattleReport`, et
`isBattleReport(match)` répond de son format.

### Module pur (`lib/battle-reports/army.ts`)

Normalisation et bornes, sans accès à la base — donc testé
(`lib/battle-reports/army.test.ts`, exécuté par `npm run test`) :

- `normalizeArmyUnits()` — fusionne les doublons, ramène les quantités dans les
  bornes, conserve l'ordre de première apparition ;
- `normalizeArmy()` — nettoie nom et lignes ;
- `isEmptyArmy()` / `countArmyUnits()` ;
- `normalizeBattleReport(report, playerIds)` — écarte les champs blancs, les
  armées vides, et celles qui ne retombent sur aucun joueur de la partie.

### Module pur (`lib/battle-reports/battle-map.ts`)

Géométrie et bornes de la table, également testées
(`lib/battle-reports/battle-map.test.ts`) :

- `defaultTableForGame(slug)` — la table habituelle du jeu ;
- `normalizeBattleMap(map, playerIds)` — ramène les jetons sur le plateau, borne
  les tailles, écarte les doublons d'identifiant, les jetons et les couleurs des
  joueurs sortis de la partie, et plafonne décors, jetons et instants ;
- `emptyBattleMap(slug, snapshotId, playerIds)` — la table de départ, avec son
  premier instant « Début de partie » et une couleur par joueur ;
- `isEmptyBattleMap(map)` — vraie seulement sans décor, sans jeton **et** sans
  note ;
- `colorForPlayer()`, `trianglePoints()` — ce que le dessin réclame, rendu
  testable en le sortant du composant.

### Base de données

Le volet vit dans le document de la partie, collection `matches`
(`matchType: 'game'`), sous la clé `battleReport`. Rien n'est ajouté ailleurs.

Les écritures sont **champ par champ** (`battleReport.scenario`,
`battleReport.armies.<userId>`) et non par remplacement de l'objet entier : le
rapport s'édite de plusieurs endroits à la fois, et réécrire le volet d'un bloc
ferait perdre au dernier arrivé ce que les autres viennent d'y mettre.

Fonctions (`lib/db/matches.ts`, exposées par `lib/db/game-matches.ts`) :

- `updateMatchBattleReport(matchId, { scenario, notes })` — un champ absent n'est
  pas touché, un champ vidé est retiré du document ;
- `setMatchBattleReportArmy(matchId, userId, army)` — une liste vide est retirée.

Retirer un joueur de la partie emporte sa liste d'armée
(`removePlayerFromMatch`) : sans cela, le rapport afficherait une armée que plus
aucun nom n'accompagne.

### Actions serveur (`app/game-matches/actions.ts`)

- `createGameMatchAction({ …, battleReport })` — crée la partie au format
  rapport ; les armées qui ne retombent sur aucun joueur résolu sont abandonnées ;
- `updateBattleReportAction(matchId, { scenario, notes })` — créateur seul ;
- `updateBattleReportArmyAction(matchId, playerId, army)` — le joueur pour sa
  liste, le créateur pour toutes ;
- `searchBattleReportUnitsAction(gameId, query)` — figurines proposées à la
  saisie (produits de type `unit` du jeu), réservée aux comptes connectés ;
- `updateBattleMapAction(matchId, map)` — table de jeu, créateur seul.

### Composants

- `components/battle-reports/ArmyListEditor.tsx` — saisie d'une liste d'armée
  (composant contrôlé : il ne sait pas enregistrer) ;
- `components/battle-reports/BattleMapEditor.tsx` — la table vue de dessus, en
  SVG : décor, jetons, instants, et la même vue en lecture seule pour les
  joueurs qui ne tiennent pas le rapport ;
- `app/game-matches/[matchId]/BattleReportSection.tsx` — le volet sur la page
  d'une partie : scénario, notes, listes de chaque joueur ;
- `app/game-matches/new/GameMatchForm.tsx` — le format et sa saisie à la création ;
- `app/game-matches/GameMatchList.tsx` — pastille « Rapport de bataille » et
  scénario dans l'historique.

## Utilisation

### Enregistrer un rapport de bataille

1. Depuis la fiche d'un jeu qui l'active, cliquer sur « Rapports de bataille » —
   ou aller sur « Parties » puis « Nouvelle partie » et choisir le jeu.
2. Le format est déjà posé pour les jeux qui l'activent ; sinon, l'activer avec
   l'interrupteur « Rapport de bataille ».
3. Renseigner date, lieu et joueurs comme pour une partie ordinaire.
4. Pour chaque joueur déjà identifié, saisir sa liste d'armée : un nom de liste
   et les figurines, cherchées dans le catalogue ou ajoutées telles quelles.
5. Renseigner le scénario et les notes si le cœur y est, puis enregistrer.

Les joueurs invités par leur tag (`username#1234`) n'ont pas encore
d'identifiant au moment de la saisie : leur liste d'armée s'ajoute depuis la page
de la partie, une fois celle-ci créée — par eux ou par le créateur.

### Compléter un rapport

Sur la page de la partie, le volet « Rapport de bataille » regroupe le scénario,
la fiche de notes et les listes d'armée. Chacun y modifie la sienne ; le créateur
modifie tout.

## Administration

La fonctionnalité s'active jeu par jeu depuis `/admin/games`, case « Rapports de
bataille ». Elle est indépendante de la fonctionnalité « Produits » : sans
catalogue de figurines, l'autocomplétion ne propose rien et tout se saisit
librement.

## Évolutions futures possibles

- Décor qui change d'un instant à l'autre (une ruine détruite, un pont coupé)
- Rotation des pièces de décor
- Listes d'armée et jetons tenus par chaque joueur plutôt que par le seul créateur
- Rendu Markdown de la fiche de notes
- Photos de la table jointes au rapport
- Score par joueur en plus du vainqueur (points de victoire, objectifs)
- Reprise d'une liste d'armée d'une partie précédente
- Statistiques par figurine : ce qui est le plus joué, ce qui gagne le plus
