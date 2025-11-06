# Fonctionnalité de Géolocalisation

## Vue d'ensemble

Le calendrier des événements permet maintenant aux utilisateurs de filtrer les événements en fonction de leur position géographique, affichant uniquement les événements des lairs situés dans un rayon défini.

## Interface utilisateur

### Mode par défaut : "Mes lieux"

Par défaut, le calendrier affiche les événements des lairs suivis par l'utilisateur.

### Mode "Proches de moi"

En cliquant sur le bouton **"Proches de moi"**, l'utilisateur accède à un formulaire permettant de :

1. **Entrer ses coordonnées GPS** manuellement au format `latitude, longitude`
   - Exemple : `48.8566, 2.3522`

2. **Obtenir sa position automatiquement** en cliquant sur le bouton de localisation
   - Utilise l'API de géolocalisation du navigateur
   - Nécessite l'autorisation de l'utilisateur

3. **Choisir une distance** dans un menu déroulant :
   - 5 km
   - 15 km (par défaut)
   - 50 km
   - 150 km

4. **Lancer la recherche** avec le bouton "Rechercher"

Une fois la recherche effectuée :
- Les événements affichés sont filtrés pour n'inclure que ceux des lairs situés dans le rayon spécifié
- Le bouton "Proches de moi" est remplacé par un bouton **"Mes lieux"**
- Un texte indique le rayon de recherche actif : "Événements dans un rayon de X km"

### Retour au mode "Mes lieux"

En cliquant sur **"Mes lieux"**, l'utilisateur revient à la vue par défaut avec ses lairs suivis.

## Architecture technique

### Composants

#### EventsCalendar.tsx
- Composant principal du calendrier
- Affiche le formulaire de géolocalisation
- Props :
  - `isLocationMode`: Boolean indiquant si le mode géolocalisation est actif
  - `onLocationSearch`: Callback appelé avec (latitude, longitude, distance)
  - `onResetLocation`: Callback pour revenir au mode "Mes lieux"

#### EventsCalendarClient.tsx
- Wrapper client qui gère l'état et les appels API
- Gère la synchronisation avec l'URL
- États :
  - `isLocationMode`: Boolean
  - `locationParams`: { latitude, longitude, distance } | null

#### API /api/events/route.ts
- Accepte les paramètres de géolocalisation via query params :
  - `userLat`: Latitude de l'utilisateur
  - `userLon`: Longitude de l'utilisateur
  - `maxDistance`: Distance maximale en kilomètres

### Flux de données

1. **Utilisateur entre ses coordonnées** → EventsCalendar
2. **Validation du format** → EventsCalendarClient
3. **Mise à jour de l'URL** avec params lat, lon, distance
4. **Appel API** avec paramètres de géolocalisation
5. **getEventsForUser** utilise `getLairIdsNearLocation`
6. **MongoDB $near** recherche avec index 2dsphere
7. **Filtrage des événements** par lairs à proximité
8. **Affichage** des résultats

### Base de données

Les coordonnées sont stockées au format GeoJSON Point :

```javascript
{
  location: {
    type: "Point",
    coordinates: [longitude, latitude]  // [lon, lat]
  }
}
```

MongoDB utilise un index `2dsphere` sur le champ `location` pour des recherches géospatiales efficaces.

## Paramètres d'URL

Format : `/events?month=11&year=2025&allGames=true&lat=48.8566&lon=2.3522&distance=15`

- `lat`: Latitude de l'utilisateur
- `lon`: Longitude de l'utilisateur
- `distance`: Distance maximale en kilomètres
- Si ces paramètres sont absents, le mode "Mes lieux" est actif

## Sécurité et confidentialité

- Les coordonnées GPS sont **uniquement stockées dans l'URL** et l'état client
- Aucune donnée de localisation n'est persistée côté serveur
- L'utilisateur doit **autoriser explicitement** la géolocalisation dans son navigateur
- L'utilisateur peut **entrer manuellement** ses coordonnées sans utiliser la géolocalisation

## Expérience utilisateur

### Avantages

1. **Découverte** : Trouver des événements près de sa position actuelle
2. **Flexibilité** : Ajuster le rayon de recherche selon les besoins
3. **Contrôle** : Basculer facilement entre "Mes lieux" et "Proches de moi"
4. **Partage** : L'URL peut être copiée pour partager une recherche géolocalisée

### Cas d'usage

- **Voyage** : Trouver des événements dans une ville visitée
- **Découverte** : Explorer de nouveaux lairs à proximité
- **Planification** : Chercher des événements dans un rayon raisonnable pour y assister

## Migration depuis l'ancien système

Si vous avez des données avec l'ancien format `coordinates`, exécutez le script de migration :

```bash
npx ts-node scripts/migrate-coordinates-to-geojson.ts
```

Voir [GEOLOCATION_MIGRATION.md](./GEOLOCATION_MIGRATION.md) pour plus de détails.
