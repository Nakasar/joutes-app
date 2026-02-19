# Migration vers la Collection Unifiée "matches"

## Vue d'ensemble

Ce refactor unifie toutes les collections de matchs dans une seule collection MongoDB `matches` avec un champ discriminateur `matchType` pour distinguer les types.

## Collections Migrées

### Avant
- `gameMatches` : Matchs de jeu (hors ligue/événement)
- `league-matches` : Matchs de ligue
- `event-match-results` : Matchs de tournoi/événement

### Après
- `matches` : Collection unifiée avec champ `matchType: 'game' | 'league' | 'event'`

## Structure Unifiée

```typescript
{
  _id: ObjectId,
  matchType: 'game' | 'league' | 'event',  // Discriminateur
  playedAt: Date,
  lairId?: string,
  createdBy: string,
  createdAt: Date,
  updatedAt?: Date,
  reportedBy?: string,
  reportedAt?: Date,
  confirmedBy?: string,
  confirmedAt?: Date,
  
  // Champs spécifiques selon matchType...
}
```

## Fichiers Modifiés

### Nouveaux Fichiers
- ✅ `lib/types/Match.ts` : Types TypeScript unifiés
- ✅ `lib/db/matches.ts` : Opérations DB unifiées
- `scripts/migrate-matches-to-unified-collection.ts` : Script de migration

### Fichiers Mis à Jour
- ✅ `lib/db/game-matches.ts` : Adapté pour utiliser la nouvelle API
- ✅ `lib/db/leagues.ts` : Adapté pour utiliser la nouvelle API
- 🔄 `app/events/[eventId]/portal/actions.ts` : À adapter
- 🔄 `lib/db/events.ts` : À vérifier si modifications nécessaires

## Actions à Effectuer

### 1. ✅ Créer la structure de types unifiés
- Types discriminés pour chaque type de match
- Type guards pour faciliter l'utilisation

### 2. ✅ Créer les opérations DB unifiées
- CRUD operations génériques
- Opérations spécifiques par type de match
- Filtrage avec support multi-types

### 3. ✅ Adapter les fichiers existants
- game-matches.ts : Wrapper autour de l'API unifiée
- leagues.ts : Utilisation directe de l'API unifiée

### 4. 🔄 Migrer les Event Matches
Les matchs d'événements dans `app/events/[eventId]/portal/actions.ts` doivent être migrés pour utiliser l'API unifiée.

**Fonctions à mettre à jour:**
- `getMatchResults()` → Utiliser `getMatches({ matchType: 'event', eventId })`
- `createMatchResult()` → Utiliser `createMatch()` avec `matchType: 'event'`
- `updateMatchResult()` → Utiliser `updateMatch()`
- `deleteMatchResult()` → Utiliser `deleteMatch()`
- `reportMatchResult()` → Utiliser `updateMatch()`
- `confirmMatchResult()` → Utiliser `updateMatch()`
- `deleteRoundMatches()` → Utiliser filtres appropriés
- Toutes les autres fonctions manipulant MATCH_RESULTS_COLLECTION

### 5. 🔄 Créer un script de migration de données
Un script doit être créé pour migrer les données existantes:
```bash
npm run migrate:matches
```

Le script doit:
- Copier tous les documents de `gameMatches` vers `matches` avec `matchType: 'game'`
- Copier tous les documents de `league-matches` vers `matches` avec `matchType: 'league'`
- Copier tous les documents de `event-match-results` vers `matches` avec `matchType: 'event'`
- Ajouter les champs manquants (leagueId, eventId selon le type)
- Créer les index appropriés
- Valider la migration

### 6. Mettre à jour les références
- Vérifier tous les imports de types
- Mettre à jour la documentation
- Mettre à jour les tests si nécessaire

## Avantages de ce Refactor

1. **Centralisation** : Une seule collection pour tous les matchs
2. **Cohérence** : Structure de données uniforme
3. **Maintenabilité** : Code plus facile à maintenir
4. **Performance** : Possibilité de créer des index globaux
5. **Évolutivité** : Facile d'ajouter de nouveaux types de matchs

## Notes de Migration

### Rétrocompatibilité
- Les wrappers dans `game-matches.ts` maintiennent la rétrocompatibilité de l'API
- Les types aliases (`GameMatch`, `LeagueMatch`) sont maintenus pour la compatibilité

### Index Recommandés
```javascript
// Index pour la performance
db.matches.createIndex({ matchType: 1, createdAt: -1 });
db.matches.createIndex({ matchType: 1, leagueId: 1 });
db.matches.createIndex({ matchType: 1, eventId: 1 });
db.matches.createIndex({ matchType: 1, gameId: 1 });
db.matches.createIndex({ matchType: 1, playerIds: 1 });
db.matches.createIndex({ matchType: 1, player1Id: 1 });
db.matches.createIndex({ matchType: 1, player2Id: 1 });
```

## Rollback

En cas de problème, les anciennes collections sont conservées et peuvent être restaurées. Le script de migration crée les nouvelles données sans supprimer les anciennes.
