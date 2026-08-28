# Fonctionnalité : Lairs Privés

## Vue d'ensemble

Les utilisateurs peuvent maintenant créer leurs propres lairs privés avec des restrictions spécifiques. Ces lieux ne sont visibles que par les utilisateurs invités via un code QR unique.

## Fonctionnalités implémentées

## Interface utilisateur

### Création de lairs privés

Les utilisateurs peuvent créer des lairs privés depuis **la page `/lairs`** via le bouton "Ajouter un lieu", visible uniquement pour les utilisateurs connectés. Le dialogue sert les deux sortes de lieux : le choix « Lieu privé » ouvre le formulaire décrit ici, « Lieu public » celui de [PUBLIC_LAIRS.md](./PUBLIC_LAIRS.md).

#### Caractéristiques de création :
- **Nom du lieu** (requis)
- **Adresse** (optionnel)
- Après création, l'utilisateur est redirigé vers la page du lair créé

### Gestion des lairs privés

La gestion des lairs privés se fait depuis **la page de gestion du lair** (`/lairs/[lairId]/manage`), accessible uniquement par les propriétaires et administrateurs.

Cette page inclut :
- 📋 Badge "Privé" dans le titre
- 🔐 **Section "Code d'invitation"** (uniquement pour les lairs privés) :
  - Affichage de l'URL d'invitation
  - QR Code généré dynamiquement avec la bibliothèque `qrcode`
  - Bouton pour copier l'URL
  - Bouton pour régénérer le code
- 👥 **Section "Abonnés"** (uniquement pour les lairs privés) :
  - Liste des utilisateurs qui suivent le lieu (hors propriétaires)
  - Bouton pour retirer un utilisateur
  - Compteur d'abonnés
  - Message si aucun abonné

#### Actions disponibles pour le propriétaire :
- 📋 **Copier l'URL d'invitation**
- 🔄 **Régénérer le code** (invalide l'ancien code)
- 👤 **Retirer des abonnés** (empêche l'accès aux événements)
- 🗑️ **Supprimer le lair** (via les actions du lair)
- ✏️ **Modifier le nom et l'adresse** (via le formulaire du lair)

#### Restrictions des lairs privés

Les lairs privés ont les restrictions suivantes (validées au niveau du schéma Zod) :
- ❌ **Pas d'URL de scraping d'événements** (`eventsSourceUrls` doit être vide)
- ❌ **Pas d'image ou de bannière** (`banner` ne peut pas être défini)
- ✅ **Code d'invitation unique** généré automatiquement

### 2. Système d'invitation par QR Code

Chaque lair privé possède :
- Un **code d'invitation unique** de 32 caractères hexadécimaux
- Une **URL d'invitation** : `/lairs/invite/[code]`
- Un **QR Code** généré automatiquement via l'API qrserver.com

#### Actions disponibles pour le propriétaire :
- 📋 **Copier l'URL d'invitation**
- 🔄 **Régénérer le code** (invalide l'ancien code)
- 🗑️ **Supprimer le lair**
- ✏️ **Modifier le nom et l'adresse**

### 3. Visibilité et filtrage

#### Dans la liste des lairs (`/lairs`)
- Les lairs privés ne sont **visibles que par les utilisateurs qui les suivent**
- Badge "Privé" avec icône cadenas pour les identifier
- Pas d'affichage dans la liste publique

#### Dans le calendrier des événements
- Les événements des lairs privés n'apparaissent que dans le calendrier des utilisateurs qui suivent ces lieux
- **Pas de découverte par localisation** : même si un lair privé est proche géographiquement, il ne sera pas affiché

#### Logique de filtrage
```typescript
// Dans getAllLairs()
if (userId) {
  // Afficher les lairs publics + lairs privés suivis
  query = {
    $or: [
      { isPrivate: { $ne: true } },
      { isPrivate: true, owners: userId },
    ]
  };
} else {
  // Uniquement lairs publics
  query = { isPrivate: { $ne: true } };
}
```

### 4. Processus d'invitation

1. Le propriétaire du lair partage l'URL ou le QR code
2. L'invité scanne le QR code ou clique sur le lien
3. Redirection vers `/lairs/invite/[code]`
4. Vérification automatique du code et ajout du lair aux lieux suivis
5. Confirmation avec lien vers le lair

## Structure de la base de données

### Schéma Lair mis à jour

```typescript
{
  // Champs existants
  name: string;
  banner?: string;
  games: string[];
  owners: string[];
  eventsSourceUrls?: string[];
  location?: GeoJSONPoint;
  address?: string;
  
  // Nouveaux champs
  isPrivate?: boolean;           // Indique si le lair est privé
  invitationCode?: string;       // Code unique pour les invitations
}
```

### Validation Zod

```typescript
lairSchema.superRefine((data, ctx) => {
  // Les lairs privés ne peuvent pas avoir d'URL de scraping
  if (data.isPrivate && data.eventsSourceUrls?.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Les lieux privés ne peuvent pas avoir d'URL de scraping d'événements",
      path: ["eventsSourceUrls"],
    });
  }
  
  // Les lairs privés ne peuvent pas avoir de bannière
  if (data.isPrivate && data.banner) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Les lieux privés ne peuvent pas avoir de bannière",
      path: ["banner"],
    });
  }
});
```

## Fichiers créés/modifiés

### Nouveaux fichiers

1. **`lib/utils/invitation-codes.ts`**
   - Génération de codes d'invitation sécurisés
   - Validation du format des codes

2. **`app/account/private-lairs-actions.ts`**
   - Actions serveur pour la gestion des lairs privés
   - `createPrivateLair()` : Créer un lair privé
   - `updatePrivateLairAction()` : Modifier un lair privé
   - `deletePrivateLairAction()` : Supprimer un lair privé
   - `regenerateInvitationCodeAction()` : Régénérer le code d'invitation
   - `acceptInvitationAction()` : Accepter une invitation

3. **`app/lairs/CreateLairButton.tsx`** (anciennement `CreatePrivateLairButton.tsx`)
   - Composant client pour le bouton et dialogue de création, privé ou public
   - Interface de création avec formulaire
   - Redirection vers le lair créé après succès

4. **`app/lairs/[lairId]/manage/PrivateLairInvitationManager.tsx`**
   - Composant client pour gérer les invitations d'un lair privé
   - Affichage et copie du QR code (généré avec la bibliothèque `qrcode`)
   - Régénération du code d'invitation

5. **`app/lairs/[lairId]/manage/PrivateLairFollowersManager.tsx`**
   - Composant client pour gérer les abonnés d'un lair privé
   - Liste des utilisateurs qui suivent le lieu
   - Bouton pour retirer un utilisateur
   - Affichage conditionnel si aucun abonné

6. **`app/lairs/invite/[code]/page.tsx`**
   - Page de traitement des invitations
   - Validation du code et ajout automatique du lair
   - Affichage de confirmation avec lien vers le lair

### Fichiers modifiés

1. **`lib/schemas/lair.schema.ts`**
   - Ajout des champs `isPrivate` et `invitationCode`
   - Validation superRefine pour les restrictions

2. **`lib/types/Lair.ts`**
   - Ajout des types `isPrivate?: boolean` et `invitationCode?: string`

3. **`lib/db/lairs.ts`**
   - `getAllLairs()` : Ajout du paramètre `userId` pour filtrer les lairs privés
   - `getLairByInvitationCode()` : Nouvelle fonction pour récupérer un lair par code
   - `regenerateInvitationCode()` : Nouvelle fonction pour régénérer le code
   - Mise à jour de `toLair()` et `toDocument()` pour inclure les nouveaux champs

4. **`lib/db/users.ts`**
   - `getUsersFollowingLair()` : Nouvelle fonction pour récupérer tous les utilisateurs qui suivent un lair
   - Utilisée pour afficher la liste des abonnés dans la page de gestion

5. **`lib/db/events.ts`**
   - `getAllEvents()` : Filtrage des événements des lairs privés
   - `getEventsByLairIds()` : Ajout du paramètre `userId` pour filtrer selon les lairs suivis

6. **`app/account/private-lairs-actions.ts`**
   - `removeFollowerFromPrivateLair()` : Nouvelle action pour retirer un utilisateur d'un lair privé
   - Vérifications de sécurité (propriétaire, lair privé, pas de retrait de propriétaire)

7. **`app/account/page.tsx`**
   - Retrait de la section "Mes lieux privés"
   - Retrait de l'import `PrivateLairsManager` et `getLairsOwnedByUser`

8. **`app/lairs/page.tsx`**
   - Ajout du bouton "Créer un lieu privé" dans le header (visible uniquement si connecté)
   - Passage de l'ID utilisateur à `getAllLairs()`
   - Ajout du badge "Privé" avec icône cadenas
   - Import du composant `CreatePrivateLairButton`

9. **`app/lairs/[lairId]/manage/page.tsx`**
   - Ajout du badge "Privé" dans le titre de la page
   - Intégration du composant `PrivateLairInvitationManager`
   - Intégration du composant `PrivateLairFollowersManager`
   - Récupération des abonnés via `getUsersFollowingLair()`
   - Affichage conditionnel des sections pour les lairs privés

## Sécurité

### Génération des codes d'invitation

- Utilisation de `crypto.randomBytes(16)` pour générer 16 bytes aléatoires
- Conversion en hexadécimal : 32 caractères
- Format de validation : `/^[0-9a-f]{32}$/`

### Contrôles d'accès

- Vérification de l'authentification pour toutes les actions
- Vérification de propriété avant modification/suppression
- Les codes d'invitation peuvent être régénérés pour révoquer l'accès

## Améliorations futures possibles

1. **Gestion des membres**
   - Liste des utilisateurs qui suivent le lair
   - Possibilité de retirer des membres
   - Rôles (propriétaire, membre)

2. **Expiration des codes**
   - Codes d'invitation avec date d'expiration
   - Nombre maximal d'utilisations

3. **Notifications**
   - Notifier le propriétaire quand quelqu'un rejoint
   - Notifier les membres des nouveaux événements

4. **Événements privés**
   - Création d'événements spécifiques aux lairs privés
   - Gestion des participants

5. **Statistiques**
   - Nombre de membres
   - Nombre d'événements créés
   - Activité du lair

## Tests recommandés

### Tests manuels à effectuer

1. ✅ Créer un lair privé
2. ✅ Générer et copier le QR code
3. ✅ Scanner le QR code avec un autre utilisateur
4. ✅ Vérifier que le lair apparaît dans les lieux suivis
5. ✅ Vérifier que les événements du lair privé apparaissent dans le calendrier
6. ✅ Régénérer le code et vérifier que l'ancien ne fonctionne plus
7. ✅ Supprimer un lair privé
8. ✅ Vérifier que les lairs privés n'apparaissent pas dans la liste publique
9. ✅ Modifier le nom et l'adresse d'un lair privé

### Tests de sécurité

1. ✅ Tenter d'accéder à un lair privé non suivi
2. ✅ Tenter de modifier un lair privé dont on n'est pas propriétaire
3. ✅ Tenter d'utiliser un code d'invitation invalide
4. ✅ Vérifier que les événements des lairs privés ne sont pas visibles par géolocalisation

## Remarques

- Les lairs privés utilisent le même système de propriété (`owners`) que les lairs publics
- Le premier owner est automatiquement l'utilisateur qui crée le lair
- Le lair est automatiquement ajouté aux lairs suivis du créateur
- Les QR codes sont générés dynamiquement via une API externe (qrserver.com)
