# Validation des données avec Zod

## Vue d'ensemble

La validation des données a été ajoutée aux server actions en utilisant Zod, une bibliothèque de validation de schémas TypeScript-first.

## Schémas créés

### 1. Schéma des jeux (`lib/schemas/game.schema.ts`)

```typescript
export const gameSchema = z.object({
  name: z.string().min(1, "Le nom du jeu est requis").max(100, "Le nom est trop long"),
  icon: z.string().url("L'URL de l'icône doit être valide"),
  banner: z.string().url("L'URL de la bannière doit être valide"),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(500, "La description est trop longue"),
  type: z.enum(["TCG", "BoardGame", "VideoGame", "Other"]),
});
```

**Validations :**
- ✅ Nom : obligatoire, 1-100 caractères
- ✅ Icône : URL valide obligatoire
- ✅ Bannière : URL valide obligatoire
- ✅ Description : 10-500 caractères
- ✅ Type : "TCG", "VideoGame", "BoardGame" ou "Other" uniquement

### 2. Schéma des lieux (`lib/schemas/lair.schema.ts`)

```typescript
export const lairSchema = z.object({
  name: z.string().min(1, "Le nom du lieu est requis").max(100, "Le nom est trop long"),
  banner: z.string().url("L'URL de la bannière doit être valide"),
  games: z.array(z.string().uuid("Chaque ID de jeu doit être un UUID valide")).default([]),
});
```

**Validations :**
- ✅ Nom : obligatoire, 1-100 caractères
- ✅ Bannière : URL valide obligatoire
- ✅ Jeux : tableau d'UUIDs valides (peut être vide)

### 3. Schémas d'ID

```typescript
export const gameIdSchema = z.string().uuid("L'ID du jeu doit être un UUID valide");
export const lairIdSchema = z.string().uuid("L'ID du lieu doit être un UUID valide");
```

## Implémentation dans les Server Actions

### Structure de validation

```typescript
try {
  await requireAdmin();
  
  // Valider les données avec Zod
  const validatedData = schema.parse(data);
  
  // Utiliser les données validées
  // ...
  
  return { success: true, ... };
} catch (error) {
  if (error instanceof z.ZodError) {
    return { 
      success: false, 
      error: error.issues[0]?.message || "Données invalides" 
    };
  }
  return { success: false, error: "Non autorisé" };
}
```

### Actions modifiées

1. **`createGame(formData)`** - Valide toutes les données du jeu avant création
2. **`deleteGame(id)`** - Valide que l'ID est un UUID valide
3. **`createLair(data)`** - Valide toutes les données du lieu avant création
4. **`deleteLair(id)`** - Valide que l'ID est un UUID valide

## Affichage des erreurs côté client

### Composants de formulaire

Les composants `GameForm` et `LairForm` ont été améliorés avec :

```typescript
const [error, setError] = useState<string | null>(null);

// Dans le handleSubmit
if (result.success) {
  // Succès
} else {
  setError(result.error || "Erreur...");
}
```

**Affichage :**
```jsx
{error && (
  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
    {error}
  </div>
)}
```

### Composants de liste

Les composants `GameList` et `LairList` affichent également les erreurs de suppression de manière élégante au lieu d'utiliser `alert()`.

## Messages d'erreur

### Erreurs de validation des jeux
- "Le nom du jeu est requis"
- "Le nom est trop long" (> 100 caractères)
- "L'URL de l'icône doit être valide"
- "L'URL de la bannière doit être valide"
- "La description doit contenir au moins 10 caractères"
- "La description est trop longue" (> 500 caractères)

### Erreurs de validation des lieux
- "Le nom du lieu est requis"
- "Le nom est trop long" (> 100 caractères)
- "L'URL de la bannière doit être valide"
- "Chaque ID de jeu doit être un UUID valide"

### Erreurs d'ID
- "L'ID du jeu doit être un UUID valide"
- "L'ID du lieu doit être un UUID valide"

## Avantages

✅ **Type-safety** : Zod infère automatiquement les types TypeScript  
✅ **Messages clairs** : Les utilisateurs voient des messages d'erreur précis  
✅ **Validation centralisée** : Un seul endroit pour définir les règles  
✅ **Sécurité** : Validation côté serveur, impossible à contourner  
✅ **DX améliorée** : IntelliSense et auto-complétion sur les données validées  
✅ **UX améliorée** : Plus d'alerts, affichage élégant des erreurs  

## Utilisation future

Pour ajouter de nouvelles validations, il suffit de :

1. Créer un schéma dans `lib/schemas/`
2. L'utiliser dans les server actions avec `.parse()`
3. Gérer les erreurs `ZodError` pour retourner des messages utiles
4. Afficher les erreurs dans les composants clients

Exemple :
```typescript
import { mySchema } from "@/lib/schemas/my.schema";

try {
  const validated = mySchema.parse(data);
  // Utiliser validated
} catch (error) {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message };
  }
}
```
