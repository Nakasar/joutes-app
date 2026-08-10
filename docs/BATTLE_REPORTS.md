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
| Joueurs | `playerIds` de la partie | Créateur (ajout / retrait), chacun peut se retirer |
| Vainqueur(s) | `winnerIds` de la partie | Créateur |
| Liste d'armée par joueur | `battleReport.armies[playerId]` | Chaque joueur pour la sienne, le créateur pour toutes |
| Scénario (champ libre) | `battleReport.scenario` | Créateur |
| Fiche de notes libres | `battleReport.notes` | Créateur |

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

## Structure technique

### Types (`lib/types/Match.ts`)

```typescript
type BattleReportArmyUnit = {
  productId?: string;   // Figurine du catalogue ; absent = saisie libre
  name: string;         // Dénormalisé : survit à la disparition du produit
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
  saisie (produits de type `unit` du jeu), réservée aux comptes connectés.

### Composants

- `components/battle-reports/ArmyListEditor.tsx` — saisie d'une liste d'armée
  (composant contrôlé : il ne sait pas enregistrer) ;
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

- Rendu Markdown de la fiche de notes
- Photos de la table jointes au rapport
- Score par joueur en plus du vainqueur (points de victoire, objectifs)
- Reprise d'une liste d'armée d'une partie précédente
- Statistiques par figurine : ce qui est le plus joué, ce qui gagne le plus
