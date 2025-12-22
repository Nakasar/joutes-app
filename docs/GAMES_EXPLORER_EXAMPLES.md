# Exemples d'Utilisation - Page Jeux

## 🎯 Scénarios d'utilisation

### 1. Naviguer vers la page des jeux

**Depuis n'importe où dans l'application :**
```tsx
import Link from "next/link";

<Link href="/games">
  <Button>Voir tous les jeux</Button>
</Link>
```

**Depuis le Header :**
Cliquez sur "Jeux" dans le menu de navigation principal (icône 🎲)

---

### 2. Accéder à un jeu spécifique

**Par slug (recommandé pour SEO) :**
```tsx
// URL friendly: /games/pokemon-tcg
<Link href={`/games/${game.slug}`}>
  {game.name}
</Link>
```

**Par ID MongoDB :**
```tsx
// URL: /games/507f1f77bcf86cd799439011
<Link href={`/games/${game.id}`}>
  {game.name}
</Link>
```

**Fonction `getGameBySlugOrId` gère les deux cas automatiquement !**

---

### 3. Créer une partie depuis un jeu

**Sur la page de détails du jeu, cliquez sur "Créer une partie"**

Ou programmatiquement :
```tsx
<Link href={`/game-matches/new?gameId=${game.id}`}>
  <Button>Créer une partie</Button>
</Link>
```

---

### 4. Filtrer les événements par jeu

**Sur la page de détails du jeu, cliquez sur "Voir les événements"**

Ou :
```tsx
<Link href={`/events?gameId=${game.id}`}>
  Événements {game.name}
</Link>
```

---

### 5. Trouver des lieux pour jouer

**Sur la page de détails du jeu, cliquez sur "Trouver un lieu"**

Ou :
```tsx
<Link href={`/lairs?gameId=${game.id}`}>
  Lieux pour {game.name}
</Link>
```

---

## 🔍 Recherche de jeux

### Interface utilisateur
1. Aller sur `/games`
2. Utiliser la barre de recherche en haut
3. Taper le nom ou une partie de la description
4. Les résultats se filtrent en temps réel

### Programmatiquement
La recherche est gérée côté client dans `GamesExplorer.tsx` :

```tsx
const filteredGames = useMemo(() => {
  if (!searchQuery.trim()) return games;
  
  const query = searchQuery.toLowerCase();
  return games.filter((game) =>
    game.name.toLowerCase().includes(query) ||
    game.description.toLowerCase().includes(query)
  );
}, [games, searchQuery]);
```

---

## 🛠️ Personnalisation

### Ajouter un nouveau jeu (Admin)

**Via l'interface admin :**
1. Aller sur `/admin/games`
2. Cliquer sur "Créer un jeu"
3. Remplir les informations :
   - Nom
   - Slug (URL-friendly, ex: "pokemon-tcg")
   - Description
   - Type (TCG, Jeu de Plateau, Autre)
   - Icône (URL)
   - Bannière (URL)

**Programmatiquement :**
```tsx
import { createGame } from "@/lib/db/games";

const newGame = await createGame({
  name: "Pokémon TCG",
  slug: "pokemon-tcg",
  description: "Le jeu de cartes à collectionner officiel Pokémon",
  type: "TCG",
  icon: "https://example.com/pokemon-icon.png",
  banner: "https://example.com/pokemon-banner.jpg",
});
```

---

### Modifier le design de la grille

**Dans `GamesExplorer.tsx`, ligne ~104 :**
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
```

**Exemples de modifications :**

**Plus de colonnes sur desktop :**
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
```

**Liste verticale au lieu de grille :**
```tsx
<div className="flex flex-col gap-4">
```

**Grille carrée avec ratio différent :**
```tsx
<Link className="aspect-square"> {/* au lieu de aspect-[2/3] */}
```

---

### Personnaliser les animations

**Dans `globals.css` :**

**Changer la durée :**
```css
.animate-fade-in {
  animation: fade-in 1s ease-out forwards; /* au lieu de 0.6s */
}
```

**Ajouter de nouveaux délais :**
```css
.animate-delay-500 {
  animation-delay: 500ms;
}
```

**Désactiver les animations :**
```tsx
// Retirer les classes animate-* des éléments
<h1 className="text-5xl font-bold"> {/* sans animate-fade-in */}
```

---

## 📊 Données requises

### Structure minimale d'un jeu

```typescript
{
  id: string;           // Généré automatiquement
  name: string;         // REQUIS
  description: string;  // REQUIS
  type: "TCG" | "BoardGame" | "VideoGame" | "Other"; // REQUIS
  slug?: string;        // Optionnel mais recommandé pour SEO
  icon?: string;        // Optionnel (URL de l'icône)
  banner?: string;      // Optionnel (URL de la bannière)
}
```

### Exemples de jeux complets

**Jeu avec toutes les données :**
```typescript
{
  id: "507f1f77bcf86cd799439011",
  name: "Magic: The Gathering",
  slug: "magic-the-gathering",
  description: "Le premier jeu de cartes à collectionner au monde...",
  type: "TCG",
  icon: "https://cdn.joutes.com/games/mtg/icon.png",
  banner: "https://cdn.joutes.com/games/mtg/banner.jpg"
}
```

**Jeu minimal :**
```typescript
{
  id: "507f1f77bcf86cd799439012",
  name: "Catan",
  description: "Un jeu de stratégie où vous colonisez une île...",
  type: "BoardGame"
}
```

---

## 🐛 Dépannage

### Le jeu n'apparaît pas

**Vérifier :**
1. Le jeu existe en base de données
2. La fonction `getAllGames()` retourne bien le jeu
3. Le cache Next.js : relancer `npm run dev`

### La recherche ne fonctionne pas

**Vérifier :**
1. Le composant `GamesExplorer` est bien "use client"
2. Les données sont bien passées en props
3. La console navigateur pour des erreurs JS

### La page de détails renvoie 404

**Vérifier :**
1. Le slug ou ID dans l'URL est correct
2. La fonction `getGameBySlugOrId` trouve bien le jeu
3. Le dossier `[gameSlugOrId]` existe bien

### Les images ne s'affichent pas

**Vérifier :**
1. Les URLs sont valides et accessibles
2. Next.js config autorise le domaine des images
3. Ajouter le domaine dans `next.config.ts` si nécessaire :

```typescript
module.exports = {
  images: {
    domains: ['cdn.joutes.com'],
  },
}
```

---

## 💡 Astuces

### Performance
- Les images de bannière devraient idéalement faire ~1920x1080px
- Les icônes ~512x512px
- Utiliser WebP pour de meilleures performances
- Les métadonnées sont générées côté serveur pour le SEO

### SEO
- Toujours utiliser un slug pour les URLs
- Format recommandé : kebab-case (ex: "pokemon-tcg")
- Description de 150-160 caractères pour les métadonnées

### Accessibilité
- Les images ont des attributs alt
- Navigation au clavier supportée
- Boutons avec aria-labels appropriés

---

**Besoin d'aide ?** Consultez la documentation complète dans `docs/GAMES_EXPLORER.md`

