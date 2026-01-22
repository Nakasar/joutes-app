# Système de Notifications

## Vue d'ensemble

Le système de notifications permet d'envoyer des messages ciblés aux utilisateurs de Joutes. Les notifications peuvent être envoyées à des utilisateurs spécifiques, aux membres d'un lieu (lair) ou aux participants d'un événement.

## Types de notifications

### 1. Notifications utilisateur (`type: 'user'`)

Notifications envoyées directement à un utilisateur spécifique.

```typescript
{
  type: 'user',
  userId: string,
  title: string,
  description: string
}
```

### 2. Notifications pour les lairs (`type: 'lair'`)

Notifications envoyées aux membres d'un lieu.

```typescript
{
  type: 'lair',
  lairId: string,
  target: 'owners' | 'followers' | 'all',
  title: string,
  description: string
}
```

- `owners` : Uniquement les propriétaires du lieu
- `followers` : Uniquement les utilisateurs qui suivent le lieu
- `all` : Tous les propriétaires et followers

### 3. Notifications pour les événements (`type: 'event'`)

Notifications envoyées aux participants d'un événement.

```typescript
{
  type: 'event',
  eventId: string,
  target: 'participants' | 'creator' | 'all',
  title: string,
  description: string
}
```

- `participants` : Uniquement les participants inscrits
- `creator` : Uniquement le créateur de l'événement
- `all` : Le créateur et tous les participants

## Utilisation

### Fonctions utilitaires

Le fichier `lib/services/notifications.ts` fournit des fonctions helper pour créer facilement des notifications :

```typescript
import { 
  notifyUser,
  notifyLairOwners,
  notifyLairFollowers,
  notifyLairAll,
  notifyEventParticipants,
  notifyEventCreator,
  notifyEventAll
} from "@/lib/services/notifications";

// Notifier un utilisateur
await notifyUser(
  userId, 
  "Bienvenue !", 
  "Merci de vous être inscrit sur Joutes"
);

// Notifier les propriétaires d'un lieu
await notifyLairOwners(
  lairId,
  "Nouvel événement",
  "Un nouvel événement a été ajouté à votre lieu"
);

// Notifier les participants d'un événement
await notifyEventParticipants(
  eventId,
  "Rappel d'événement",
  "L'événement commence dans 1 heure"
);
```

### Utilisation directe

Vous pouvez aussi utiliser directement la fonction `createNotification` :

```typescript
import { createNotification } from "@/lib/db/notifications";

await createNotification({
  type: 'user',
  userId: 'user123',
  title: 'Notification personnalisée',
  description: 'Contenu de la notification'
});
```

## Page des notifications

Les utilisateurs peuvent consulter leurs notifications sur la page `/notifications`.

### Fonctionnalités

- **Liste des notifications** : Affichage de toutes les notifications pertinentes pour l'utilisateur
- **État de lecture** : Les notifications peuvent être marquées comme lues
- **Marquer tout comme lu** : Bouton pour marquer toutes les notifications comme lues
- **Ordre chronologique** : Les notifications sont triées par date (plus récentes en premier)

### Actions disponibles

```typescript
import { 
  getNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction
} from "@/app/notifications/actions";

// Récupérer les notifications de l'utilisateur
const result = await getNotificationsAction();

// Marquer une notification comme lue
await markNotificationAsReadAction(notificationId);

// Marquer toutes les notifications comme lues
await markAllNotificationsAsReadAction();
```

## Structure de données

### Base de données (MongoDB)

Collection : `notifications`

```typescript
{
  id: string,
  title: string,
  description: string,
  createdAt: string, // ISO 8601
  readBy: string[], // IDs des utilisateurs qui ont lu la notification
  
  // Champs spécifiques au type
  type: 'user' | 'lair' | 'event',
  
  // Si type === 'user'
  userId?: string,
  
  // Si type === 'lair'
  lairId?: string,
  target?: 'owners' | 'followers' | 'all',
  
  // Si type === 'event'
  eventId?: string,
  target?: 'participants' | 'creator' | 'all'
}
```

## Exemples d'utilisation

### Notifier lors de la création d'un événement

```typescript
// Dans app/events/actions.ts
import { notifyLairFollowers } from "@/lib/services/notifications";

export async function createEventAction(input: CreateEventInput) {
  // ... création de l'événement
  
  if (input.lairId) {
    await notifyLairFollowers(
      input.lairId,
      `Nouvel événement : ${input.name}`,
      `Un nouvel événement ${input.gameName} a été ajouté pour le ${formatDate(input.startDateTime)}`
    );
  }
  
  return { success: true, event };
}
```

### Notifier un participant ajouté à un événement

```typescript
// Dans app/events/actions.ts
import { notifyUser } from "@/lib/services/notifications";

export async function addParticipantAction(eventId: string, userId: string) {
  // ... ajout du participant
  
  const event = await getEventById(eventId);
  
  await notifyUser(
    userId,
    "Inscription confirmée",
    `Vous êtes inscrit à l'événement "${event.name}"`
  );
  
  return { success: true };
}
```

### Notifier le créateur d'un événement

```typescript
// Quand un utilisateur s'inscrit à un événement
import { notifyEventCreator } from "@/lib/services/notifications";

await notifyEventCreator(
  eventId,
  "Nouvelle inscription",
  `${userName} s'est inscrit à votre événement`
);
```

## Composants

### `NotificationItem`

Composant pour afficher une notification individuelle.

```tsx
<NotificationItem
  notification={notification}
  userId={currentUserId}
  onMarkAsRead={() => console.log('Notification lue')}
/>
```

### `NotificationsList`

Composant pour afficher la liste complète des notifications.

```tsx
<NotificationsList
  initialNotifications={notifications}
  userId={currentUserId}
/>
```

## Schéma de validation (Zod)

Le schéma de validation est défini dans `lib/schemas/notification.schema.ts` :

```typescript
import { notificationSchema } from "@/lib/schemas/notification.schema";

// Valider une notification
const result = notificationSchema.safeParse(notificationData);
```

## Types TypeScript

Les types sont définis dans `lib/types/Notification.ts` :

```typescript
import { Notification, NotificationTarget } from "@/lib/types/Notification";
```
