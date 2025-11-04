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
- Affichage également des parties créées par l'utilisateur (même s'il n'y a pas participé)
- Vue chronologique (les parties les plus récentes en premier)
- Affichage des informations clés : jeu, date, lieu, liste des joueurs
- Badge "Créateur" sur les parties créées par l'utilisateur

### 3. Gestion des parties

#### Pour un joueur participant :
- **Quitter une partie** : Un joueur peut se retirer de la liste des participants d'une partie

#### Pour le créateur :
- **Retirer un joueur** : Le créateur peut retirer n'importe quel joueur de la partie (y compris lui-même)
- **Supprimer la partie** : Le créateur peut supprimer complètement une partie

Toutes les actions de suppression nécessitent une confirmation via une boîte de dialogue.

### 4. Filtres

- Filtre par jeu pour affiner la liste des parties affichées

### 5. Partage de l'historique

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

#### Fonctions disponibles (`lib/db/game-matches.ts`) :
- `createGameMatch()` - Créer une nouvelle partie
- `getGameMatchById()` - Récupérer une partie par ID
- `getGameMatches(filters)` - Récupérer des parties avec filtres
- `getGameMatchesByUser(userId)` - Récupérer toutes les parties d'un utilisateur (joueur ou créateur)
- `updateGameMatch()` - Mettre à jour une partie
- `deleteGameMatch()` - Supprimer une partie
- `removePlayerFromGameMatch()` - Retirer un joueur d'une partie

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
- `deleteGameMatchAction()` - Supprimer une partie (créateur uniquement)
- `removePlayerFromMatchAction()` - Retirer un joueur (créateur ou soi-même)

### Pages et composants

#### Pages
- `/game-matches` - Liste de l'historique des parties
- `/game-matches/new` - Formulaire de création de partie

#### Composants
- `GameMatchForm` - Formulaire d'ajout d'une partie
- `GameMatchList` - Affichage de la liste des parties
- `GameMatchFilters` - Filtres pour l'historique
- `GameMatchesClient` - Composant client avec gestion d'état
- `GameMatchActions` - Actions de suppression avec confirmations

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
2. Voir toutes les parties où vous avez participé ou que vous avez créées
3. Utiliser le filtre pour afficher uniquement certains jeux

### Gérer les parties

#### Quitter une partie (joueur)
1. Aller sur la page "Parties"
2. Cliquer sur "Quitter la partie" sur une partie où vous participez
3. Confirmer dans la boîte de dialogue

#### Retirer un joueur (créateur)
1. Aller sur la page "Parties"
2. Sur une partie que vous avez créée, cliquer sur l'icône de suppression à côté d'un joueur
3. Confirmer dans la boîte de dialogue

#### Supprimer une partie (créateur)
1. Aller sur la page "Parties"
2. Sur une partie que vous avez créée, cliquer sur "Supprimer la partie"
3. Confirmer dans la boîte de dialogue

## Évolutions futures possibles

- Filtres avancés (par joueur, par date)
- Statistiques (nombre de parties par jeu, joueurs les plus fréquents)
- Ajout de résultats/scores
- Ajout de notes ou commentaires sur les parties
- Modification des informations d'une partie (créateur uniquement)
- Export de l'historique
- Partage de parties sur les réseaux sociaux
- Recherche dans l'historique
- Notifications aux joueurs quand ils sont ajoutés à une partie
