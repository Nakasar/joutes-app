# Optimisation du Calendrier d'Événements

## Vue d'ensemble

Le calendrier d'événements a été optimisé pour charger uniquement les événements du mois sélectionné et permettre une navigation fluide entre les mois avec des paramètres d'URL persistants.

## Changements apportés

### 1. Filtrage par mois dans la base de données

**Fichier**: `lib/db/events.ts`

La fonction `getEventsForUser` a été améliorée pour accepter des paramètres optionnels `month` et `year`:

```typescript
export async function getEventsForUser(
  userId: string, 
  allGames: boolean,
  month?: number,
  year?: number
): Promise<Event[]>
```

- Utilise une agrégation MongoDB pour filtrer directement les événements par plage de dates
- Ne récupère que les événements du mois demandé (ou tous si aucun mois n'est spécifié)
- Optimise les performances en réduisant le volume de données transférées

### 2. API Route pour les fetches dynamiques

**Fichier**: `app/api/events/route.ts`

Une nouvelle route API permet au client de récupérer les événements d'un mois spécifique:

```
GET /api/events?month=11&year=2025&allGames=true
```

Paramètres:
- `month`: Mois à récupérer (1-12)
- `year`: Année à récupérer
- `allGames`: `true` pour tous les jeux, `false` pour les jeux de l'utilisateur uniquement

### 3. Composant Client pour la navigation

**Fichier**: `components/EventsCalendarClient.tsx`

Nouveau composant client qui gère:
- La navigation entre les mois
- Les fetches dynamiques vers l'API
- La synchronisation avec les paramètres d'URL
- L'état de chargement

### 4. Composant EventsCalendar amélioré

**Fichier**: `app/events/EventsCalendar.tsx`

Le composant accepte maintenant des props contrôlées:
- `currentMonth` et `currentYear`: Mois/année contrôlés
- `showAllGames`: État du filtre contrôlé
- `onMonthChange`: Callback pour la navigation
- `onToggleAllGames`: Callback pour le changement de filtre

Compatible avec l'utilisation autonome (non contrôlée) et contrôlée.

### 5. Paramètres d'URL

Les pages utilisent maintenant des searchParams pour persister l'état:

```
/?month=11&year=2025&allGames=true
/events?month=12&year=2025&allGames=false
```

- `month`: Mois affiché (défaut: mois actuel)
- `year`: Année affichée (défaut: année actuelle)
- `allGames`: Afficher tous les jeux (défaut: `true`)

## Architecture

```
Page (Server Component)
  ↓ searchParams
EventsCalendarWrapper (Server Component)
  ↓ Fetch initial du mois courant
EventsCalendarClient (Client Component)
  ↓ Navigation/changement de filtre
API Route (/api/events)
  ↓
getEventsForUser (avec month/year)
  ↓
MongoDB (filtrage optimisé)
```

## Avantages

1. **Performance**: Ne charge que les événements nécessaires
2. **UX**: Navigation fluide avec état persistant dans l'URL
3. **SEO**: URLs partageables avec état
4. **Scalabilité**: Gère un grand nombre d'événements sans problème
5. **Navigation navigateur**: Boutons précédent/suivant fonctionnent

## Utilisation

### Affichage simple
```tsx
<EventsCalendarWrapper />
```

### Avec chemin de base personnalisé
```tsx
<EventsCalendarWrapper basePath="/events" searchParams={params} />
```

### Dans une page
```tsx
export default async function EventsPage({ searchParams }: EventsPageProps) {
  const params = await searchParams;
  return <EventsCalendarWrapper basePath="/events" searchParams={params} />;
}
```

## Notes techniques

- Les dates sont gérées avec Luxon pour la cohérence
- Le filtrage par jeu est fait côté serveur quand `allGames=false`
- Le composant EventsCalendar reste compatible en mode autonome
- L'agrégation MongoDB utilise `$lookup` pour joindre avec la collection `games`
