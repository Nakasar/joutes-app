# Leagues and Tournaments

## Vue d'ensemble

Organiser des leagues étalées dans le temps et des tournois sur la plateforme Joutes.

## Pages

- `/leagues` - Liste des ligues publiques avec filtres et recherche
- `/leagues/new` - Création d'une nouvelle ligue
- `/leagues/:leagueId` - Détails d'une ligue (classement, règles, inscription)
- `/leagues/:leagueId/manage` - Gestion d'une ligue (pour les organisateurs)

## Modèle de données

### Type League

```typescript
type League = {
  id: string;
  name: string;
  description?: string;
  banner?: string;
  
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
- `victoryPoints: number` (default: 1) : Points attribués pour une victoire contre une cible.
- `defeatPoints: number` (default: 0) : Points attribués pour une défaite contre une cible.

#### Points

`format: 'POINTS'`

Les leagues de format 'POINTS' fonctionnent par points accumulés lors des évènements et parties qui composent la league.

Paramètres:
- `pointsRules: object` with 
  - `participation: number` (default: 0)
  - `victory: number` (default: 2)
  - `defeat: number` (default: 1)
  - `feats: array` (default: [])
    - `title: string` : titre du haut-fait
    - `points: number` (default: 1) : points rapportés par le haut fait
    - `maxPerEvent?: number` (default: 1)
    - `maxPerLeague?: number` (default: undefined)

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
- Supprimer une ligue

## Fichiers

- `lib/types/League.ts` - Types TypeScript
- `lib/db/leagues.ts` - Fonctions d'accès à la base de données
- `app/leagues/actions.ts` - Server actions
- `app/leagues/page.tsx` - Page de liste
- `app/leagues/new/page.tsx` - Page de création
- `app/leagues/[leagueId]/page.tsx` - Page de détails
- `app/leagues/[leagueId]/manage/page.tsx` - Page de gestion
