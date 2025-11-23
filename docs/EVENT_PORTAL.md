# Portail d'Événement

## Vue d'ensemble

Le portail d'événement est un système complet permettant de gérer des tournois dans l'application. Il se divise en deux sections principales :

- **Section Organisateur** : Pour le créateur de l'événement
- **Section Joueur** : Pour les participants de l'événement

## Accès au Portail

Le portail est accessible à l'URL : `/events/:eventId/portal`

### Contrôle d'accès

- L'utilisateur doit être authentifié
- L'utilisateur doit être soit :
  - Le créateur de l'événement (accès à la section organisateur)
  - Un participant de l'événement (accès à la section joueur)

## Section Organisateur

### Fonctionnalités

#### 1. Paramètres du Portail

L'organisateur peut initialiser et configurer le portail avec :

- **Phases du tournoi** : Définir les différentes phases (rondes suisses, élimination directe)
- **Type de match** : BO1, BO2, BO3, BO5
- **Paramètres globaux** :
  - Auto-rapport des résultats par les joueurs
  - Confirmation requise par l'adversaire

#### 2. Gestion des Phases

- Créer plusieurs phases de tournoi
- Définir l'ordre des phases
- Changer le statut d'une phase (non démarrée, en cours, terminée)
- Définir la phase courante

**Types de phases** :
- **Rondes suisses** : Nécessite de définir le nombre de rondes
- **Élimination directe (Bracket)** : Système de bracket classique

#### 3. Gestion des Matchs

- Créer manuellement des matchs
- Assigner les joueurs (par ID)
- Définir les scores
- Modifier les résultats
- Supprimer des matchs

**Statuts de match** :
- `pending` : En attente
- `in-progress` : En cours
- `completed` : Terminé
- `disputed` : Contesté

#### 4. Annonces

- Créer des annonces pour communiquer avec les participants
- Définir la priorité (normale, importante, urgente)
- Supprimer des annonces

### Interface

L'interface organisateur comprend 3 onglets :

1. **Paramètres** : Configuration du portail et gestion des phases
2. **Matchs** : Création et gestion des matchs
3. **Annonces** : Communication avec les participants

## Section Joueur

### Fonctionnalités

#### 1. Match Actuel

- Visualiser le match en cours ou à venir
- Voir les scores actuels
- Rapporter le résultat (si autorisé)
- Confirmer le résultat rapporté par l'adversaire

#### 2. Historique

- Consulter tous les matchs terminés
- Voir les scores et résultats (Victoire/Défaite/Égalité)
- Visualiser les rondes

#### 3. Classement

- Statistiques personnelles :
  - Nombre de victoires
  - Nombre de défaites
  - Nombre d'égalités
  - Taux de victoire

#### 4. Annonces

- Consulter les annonces de l'organisateur
- Voir la priorité et la date de chaque annonce

### Interface

L'interface joueur comprend 4 onglets :

1. **Match actuel** : Voir et gérer son match en cours
2. **Historique** : Consulter ses matchs passés
3. **Classement** : Voir ses statistiques
4. **Annonces** : Lire les messages de l'organisateur

## Flux de Travail Typique

### Pour l'Organisateur

1. Accéder au portail depuis la page de l'événement
2. Initialiser les paramètres du portail
3. Créer les phases du tournoi (ex: "Rondes suisses", "Top 8")
4. Créer les matchs pour chaque phase
5. Définir la phase courante
6. Publier des annonces si nécessaire
7. Collecter et valider les résultats

### Pour les Joueurs

1. Accéder au portail depuis la page de l'événement
2. Consulter son match actuel
3. Jouer le match
4. Rapporter le résultat
5. Attendre la confirmation de l'adversaire (si requise)
6. Consulter son historique et son classement
7. Lire les annonces de l'organisateur

## Schémas de Données

### EventPortalSettings

```typescript
{
  eventId: string;
  phases: TournamentPhase[];
  currentPhaseId?: string;
  matchesPerRound?: number;
  allowSelfReporting: boolean; // Défaut: true
  requireConfirmation: boolean; // Défaut: true
  createdAt: string;
  updatedAt: string;
}
```

### TournamentPhase

```typescript
{
  id: string;
  name: string;
  type: 'swiss' | 'bracket';
  matchType: 'BO1' | 'BO2' | 'BO3' | 'BO5';
  rounds?: number; // Pour les rondes suisses
  order: number;
  status: 'not-started' | 'in-progress' | 'completed';
}
```

### MatchResult

```typescript
{
  matchId: string;
  phaseId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  winnerId?: string;
  round?: number; // Pour les rondes suisses
  bracketPosition?: string; // Pour les brackets (ex: "QF1", "SF1")
  status: 'pending' | 'in-progress' | 'completed' | 'disputed';
  reportedBy?: string;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Announcement

```typescript
{
  id: string;
  eventId: string;
  message: string;
  createdBy: string;
  createdAt: string;
  priority: 'normal' | 'important' | 'urgent';
}
```

## Collections MongoDB

- `event-portal-settings` : Paramètres du portail par événement
- `event-match-results` : Résultats des matchs
- `event-announcements` : Annonces

## Actions Serveur

### Paramètres
- `getPortalSettings(eventId)` : Récupérer les paramètres
- `createOrUpdatePortalSettings(data)` : Créer/Modifier les paramètres

### Phases
- `addPhase(eventId, phaseData)` : Ajouter une phase
- `updatePhaseStatus(eventId, phaseId, status)` : Changer le statut
- `setCurrentPhase(eventId, phaseId)` : Définir la phase courante

### Matchs
- `getMatchResults(eventId, phaseId?)` : Récupérer les matchs
- `createMatchResult(eventId, data)` : Créer un match
- `reportMatchResult(eventId, data)` : Rapporter un résultat (joueur)
- `confirmMatchResult(eventId, data)` : Confirmer un résultat (joueur)
- `updateMatchResult(eventId, matchId, data)` : Modifier un résultat (organisateur)
- `deleteMatchResult(eventId, matchId)` : Supprimer un match

### Annonces
- `getAnnouncements(eventId)` : Récupérer les annonces
- `createAnnouncement(eventId, data)` : Créer une annonce
- `deleteAnnouncement(eventId, announcementId)` : Supprimer une annonce

## Sécurité

- Toutes les actions nécessitent une authentification
- Les actions organisateur vérifient que l'utilisateur est le créateur de l'événement
- Les actions joueur vérifient que l'utilisateur est participant
- Les joueurs ne peuvent rapporter/confirmer que leurs propres matchs

## Améliorations Futures

- Génération automatique des matchs (pairings suisses, brackets)
- Calcul automatique des classements (Elo, points, etc.)
- Export des résultats (PDF, CSV)
- Notifications en temps réel
- Système de contestation des résultats
- Intégration avec des services de streaming
- Historique des modifications
- Statistiques avancées
