# Fonctionnalité : Déblocage de succès par les administrateurs

## Description

Cette fonctionnalité permet aux administrateurs de débloquer manuellement des succès pour n'importe quel utilisateur depuis leur page de profil.

## Fichiers créés

### 1. `/app/users/admin-actions.ts`
Action serveur sécurisée qui permet de débloquer un succès pour un utilisateur. Cette action :
- Vérifie que l'utilisateur est administrateur via `requireAdmin()`
- Utilise la nouvelle fonction `unlockAchievementById()` pour débloquer le succès
- Revalide les chemins concernés pour mettre à jour l'affichage
- Retourne un résultat avec succès ou erreur

### 2. `/app/users/UnlockAchievementButton.tsx`
Composant client qui affiche un bouton avec une modale pour :
- Sélectionner un succès parmi ceux non encore débloqués par l'utilisateur
- Afficher les détails du succès sélectionné (description, points, catégorie)
- Débloquer le succès via l'action serveur
- Afficher des messages de succès ou d'erreur
- Rafraîchir la page automatiquement après le déblocage

## Fichiers modifiés

### 1. `/lib/db/achievements.ts`
Ajout de la fonction `unlockAchievementById()` qui permet de débloquer un succès en utilisant son ID au lieu de son slug.

### 2. `/app/users/[userTagOrId]/page.tsx`
- Import du nouveau composant `UnlockAchievementButton`
- Ajout de la vérification `checkAdmin()` pour déterminer si l'utilisateur actuel est admin
- Récupération de tous les succès disponibles pour les admins
- Filtrage des succès non encore débloqués
- Affichage du bouton dans l'en-tête du profil, uniquement visible aux admins

## Fonctionnement

1. Lorsqu'un administrateur visite la page de profil d'un utilisateur (`/users/[userTagOrId]`)
2. Si des succès non débloqués existent, un bouton "Débloquer un succès" apparaît à côté du nom de l'utilisateur
3. En cliquant sur le bouton, une modale s'ouvre avec :
   - Une liste déroulante de tous les succès disponibles (non encore débloqués)
   - Les détails du succès sélectionné
4. L'admin sélectionne un succès et clique sur "Débloquer"
5. Le succès est débloqué et un message de confirmation s'affiche
6. La page se rafraîchit automatiquement pour afficher le nouveau succès

## Sécurité

- Toutes les actions sont protégées par `requireAdmin()` qui vérifie :
  - Que l'utilisateur est connecté
  - Que son email est dans la liste des administrateurs
- Les actions serveur utilisent la directive `"use server"` pour être exécutées côté serveur uniquement
- Le bouton n'est visible que si `isAdmin` est true (vérifié côté serveur)

## Interface utilisateur

Le bouton utilise :
- Les composants shadcn/ui : `Button`, `Dialog`, `Select`, `Alert`
- Les icônes lucide-react : `Trophy`, `Plus`, `CheckCircle`, `AlertCircle`
- Une interface claire et intuitive avec feedback visuel
- Des messages d'erreur et de succès pour guider l'utilisateur

