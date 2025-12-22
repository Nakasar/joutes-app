# Guide de test - Fonctionnalité Lieux mis en avant

## Fonctionnalité implémentée

Les administrateurs peuvent maintenant ajouter des "lieux mis en avant" (featuredLairs) pour chaque jeu depuis l'administration. Les événements de ces lieux sont affichés au format agenda sur la page du jeu.

## Modifications apportées

### 1. Type et base de données
- ✅ Ajout du champ `featuredLairs` au type `Game` (`lib/types/Game.ts`)
- ✅ Mise à jour des fonctions de conversion dans `lib/db/games.ts`
- ✅ Ajout de la fonction `getLairsByIds` dans `lib/db/lairs.ts`

### 2. Administration
- ✅ Création du composant `FeaturedLairsManager` (`app/admin/games/FeaturedLairsManager.tsx`)
- ✅ Intégration dans `GameForm` (visible uniquement en mode édition)
- ✅ Création de l'action `updateGameFeaturedLairs` (`app/admin/games/actions.ts`)
- ✅ Création de l'API route `/api/lairs` pour récupérer les lieux

### 3. Page du jeu
- ✅ Création du composant `FeaturedEventsAgenda` (`app/games/[gameSlugOrId]/FeaturedEventsAgenda.tsx`)
- ✅ Intégration dans la page du jeu (`app/games/[gameSlugOrId]/page.tsx`)

## Comment tester

### 1. Accéder à l'administration des jeux
```
1. Se connecter en tant qu'administrateur
2. Aller sur /admin/games
3. Cliquer sur "Modifier" pour un jeu existant
```

### 2. Gérer les lieux mis en avant
```
1. Dans le formulaire d'édition, descendre jusqu'à la section "Lieux mis en avant"
2. Cliquer sur "Gérer"
3. Sélectionner un ou plusieurs lieux dans la liste
4. Cliquer sur "Sauvegarder"
5. Les lieux sélectionnés apparaissent maintenant avec un badge
```

### 3. Vérifier l'affichage sur la page du jeu
```
1. Aller sur la page du jeu (ex: /games/[gameId])
2. Si des lieux sont mis en avant, une nouvelle section "Événements à venir" apparaît
3. Les événements sont regroupés par lieu
4. Chaque événement est affiché au format agenda avec :
   - Date
   - Heure de début et de fin
   - Prix (si applicable)
   - Statut (Disponible / Complet / Annulé)
   - Nombre de participants (si applicable)
   - Lien externe (si disponible)
```

## Points techniques

### API utilisée
- `GET /api/lairs?gameId={id}` - Récupère les lieux pour un jeu
- `GET /api/events?lairId={id}&gameName={name}` - Récupère les événements d'un lieu

### Format d'affichage
- **Titre** : "Événements à venir"
- **Groupement** : Par lieu (avec nom et adresse)
- **Tri** : Chronologique (du plus proche au plus éloigné)
- **Filtrage** : Uniquement les événements futurs

### Responsive
Le composant est responsive et s'adapte aux différentes tailles d'écran.

### Design
- Style cohérent avec le reste de l'application
- Fond sombre avec effet de verre (backdrop-blur)
- Badges de couleur pour les statuts
- Animations au survol

## Améliorations futures possibles

1. **Filtrage par date** : Permettre de filtrer les événements par période
2. **Tri personnalisable** : Permettre de trier par date, prix, lieu, etc.
3. **Recherche** : Ajouter une barre de recherche pour filtrer les événements
4. **Pagination** : Si trop d'événements, paginer l'affichage
5. **Cache** : Mettre en cache les événements pour améliorer les performances
6. **Favoris** : Permettre aux utilisateurs de marquer des événements en favoris
7. **Notifications** : Notifier les utilisateurs des nouveaux événements

