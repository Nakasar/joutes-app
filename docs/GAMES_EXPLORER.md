# Page d'Exploration des Jeux (Netflix-Style)

## Vue d'ensemble

Cette fonctionnalité ajoute une interface moderne inspirée de Netflix pour explorer les jeux disponibles sur la plateforme Joutes.

## Structure des fichiers

### Pages principales

- **`/app/games/page.tsx`** : Page principale d'exploration des jeux
- **`/app/games/GamesExplorer.tsx`** : Composant client pour l'affichage et la recherche
- **`/app/games/[gameSlugOrId]/page.tsx`** : Page de détails d'un jeu spécifique
- **`/app/games/[gameSlugOrId]/not-found.tsx`** : Page 404 personnalisée pour les jeux

### Fonctions base de données

- **`lib/db/games.ts`** : Ajout de la fonction `getGameBySlugOrId()` pour récupérer un jeu par son slug ou son ID

## Fonctionnalités

### Page d'exploration (`/games`)

- **Hero Section** : Section d'en-tête immersive avec fond animé
- **Barre de recherche** : Recherche en temps réel par nom ou description
- **Grille de jeux** : Organisation par type de jeu (TCG, Jeu de Plateau, Autre)
- **Cards interactives** : 
  - Effet hover avec zoom
  - Affichage progressif de la description
  - Badge de type de jeu
  - Images de bannière ou icône

### Page de détails (`/games/[gameSlugOrId]`)

- **Hero Banner** : Grande bannière immersive avec informations principales
- **Actions rapides** :
  - Créer une partie
  - Voir les événements
  - Trouver un lieu de jeu
- **Section "À propos"** : Informations détaillées sur le jeu
- **Section Communauté** : Liens vers parties, événements et lieux associés

## Design

### Palette de couleurs

- Fond : Dégradé du noir au gris foncé
- Texte : Blanc et nuances de gris
- Accents : Bleu, violet, vert pour les différentes sections

### Animations

- `animate-fade-in` : Animation d'apparition en fondu
- `animate-delay-{100,200,300}` : Délais d'animation pour effets séquentiels
- Effets hover : Scale et ring pour les interactions

### Responsive Design

- Grid adaptatif : 2 colonnes sur mobile, jusqu'à 5 sur très grand écran
- Tailles de texte adaptatives
- Layout flexible pour tous les écrans

## Utilisation

### Recherche de jeux

1. Accéder à `/games`
2. Utiliser la barre de recherche pour filtrer par nom ou description
3. Cliquer sur un jeu pour voir ses détails

### Navigation

- **Depuis la page d'accueil** : Lien vers `/games` dans le header
- **Depuis un jeu** : Cliquer sur une card pour accéder à `/games/[slug-ou-id]`
- **Retour** : Bouton "Retour aux jeux" sur la page de détails

## Routes supportées

- `/games` : Liste de tous les jeux
- `/games/pokemon-tcg` : Détails du jeu (par slug)
- `/games/507f1f77bcf86cd799439011` : Détails du jeu (par ID MongoDB)

## Intégrations

### Liens vers d'autres fonctionnalités

- **Parties** : `/game-matches?gameId={id}` ou `/game-matches/new?gameId={id}`
- **Événements** : `/events?gameId={id}`
- **Lieux** : `/lairs?gameId={id}`

## Améliorations futures possibles

- [ ] Filtres avancés (par type, popularité, etc.)
- [ ] Tri personnalisé (alphabétique, date d'ajout, etc.)
- [ ] Statistiques de jeu (nombre de parties, joueurs actifs)
- [ ] Suggestions de jeux similaires
- [ ] Favoris / Jeux suivis
- [ ] Carousel de jeux populaires
- [ ] Intégration d'images de fond dynamiques
- [ ] Mode liste vs grille
- [ ] Partage social

