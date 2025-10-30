# Fonctionnalité : Historique des Parties

## Vue d'ensemble

Cette fonctionnalité permet aux utilisateurs d'enregistrer et de consulter l'historique de leurs parties jouées sur tous les jeux supportés par la plateforme.

## Fonctionnalités principales

### 1. Enregistrement d'une partie

Les utilisateurs peuvent enregistrer une nouvelle partie en renseignant :
- **Jeu** : Sélection parmi tous les jeux disponibles sur la plateforme
- **Date et heure** : Quand la partie a été jouée
- **Lieu (optionnel)** : Association avec un lair existant
- **Joueurs** : Liste des participants avec leur username et discriminant (#1234)

Le créateur de la partie est automatiquement ajouté comme joueur.

### 2. Consultation de l'historique

- Affichage de toutes les parties où l'utilisateur connecté a participé
- Vue chronologique (les parties les plus récentes en premier)
- Affichage des informations clés : jeu, date, lieu, liste des joueurs

### 3. Partage de l'historique

Les parties sont partagées : quand un utilisateur enregistre une partie avec d'autres joueurs, tous les participants voient cette partie dans leur propre historique.

## Structure technique

### Types et Schémas

#### `GameMatch` (`lib/types/GameMatch.ts`)
```typescript
type GameMatch = {
  id: string;
  gameId: string;           // Référence au jeu
  playedAt: Date;           // Date et heure de la partie
  lairId?: string;          // Référence au lieu (optionnel)
  players: GameMatchPlayer[]; // Liste des joueurs
  createdBy: string;        // ID de l'utilisateur créateur
  createdAt: Date;          // Date de création de l'enregistrement
}
```

#### `GameMatchPlayer` (`lib/types/GameMatch.ts`)
```typescript
type GameMatchPlayer = {
  userId: string;           // ID de l'utilisateur
  username: string;         // Nom complet (displayName#discriminator)
  displayName?: string;     // Partie avant le #
  discriminator?: string;   // Partie après le # (4 chiffres)
}
```

### Base de données

#### Collection MongoDB : `gameMatches`

Fonctions disponibles (`lib/db/game-matches.ts`) :
- `createGameMatch()` - Créer une nouvelle partie
- `getGameMatchById()` - Récupérer une partie par ID
- `getGameMatches(filters)` - Récupérer des parties avec filtres
- `getGameMatchesByUser(userId)` - Récupérer toutes les parties d'un utilisateur
- `updateGameMatch()` - Mettre à jour une partie
- `deleteGameMatch()` - Supprimer une partie

#### Filtres disponibles
```typescript
interface GetGameMatchesFilters {
  userId?: string;          // Parties d'un utilisateur spécifique
  gameId?: string;          // Parties d'un jeu spécifique
  lairId?: string;          // Parties dans un lieu spécifique
  playerUserIds?: string[]; // Parties contenant au moins un de ces joueurs
}
```

### Actions serveur

Fichier : `app/game-matches/actions.ts`

- `createGameMatchAction()` - Créer une nouvelle partie (avec validation)
- `getGameMatchesAction()` - Récupérer des parties avec filtres
- `getUserGameMatchesAction()` - Récupérer les parties de l'utilisateur connecté

### Pages et composants

#### Pages
- `/game-matches` - Liste de l'historique des parties
- `/game-matches/new` - Formulaire de création de partie

#### Composants
- `GameMatchForm` - Formulaire d'ajout d'une partie
- `GameMatchList` - Affichage de la liste des parties

### Navigation

Le lien "Parties" a été ajouté dans le header principal pour les utilisateurs connectés.

## Utilisation

### Ajouter une partie

1. Cliquer sur "Parties" dans la navigation
2. Cliquer sur "Nouvelle partie"
3. Remplir le formulaire :
   - Sélectionner le jeu
   - Choisir la date et l'heure
   - (Optionnel) Sélectionner un lieu
   - Ajouter les joueurs (format : username#1234 ou juste username)
4. Cliquer sur "Enregistrer la partie"

### Consulter l'historique

1. Cliquer sur "Parties" dans la navigation
2. Voir toutes les parties où vous avez participé

## Évolutions futures possibles

- Filtres avancés (par jeu, par joueur, par date)
- Statistiques (nombre de parties par jeu, joueurs les plus fréquents)
- Ajout de résultats/scores
- Ajout de notes ou commentaires sur les parties
- Export de l'historique
- Partage de parties sur les réseaux sociaux
- Recherche dans l'historique
