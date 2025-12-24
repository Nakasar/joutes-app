# Exemples d'utilisation du thème hivernal

## Classes CSS disponibles

### Effets visuels

```tsx
// Effet de givre sur une carte
<div className="frost-effect p-6 rounded-lg">
  <h2>Contenu avec effet givré</h2>
</div>

// Effet de scintillement (animation)
<div className="winter-sparkle">
  ✨ Élément scintillant
</div>

// Effet au survol
<button className="winter-hover p-4 rounded">
  Survolez-moi !
</button>
```

### Variables CSS personnalisées

```css
/* Utiliser les couleurs de Noël */
.my-element {
  color: var(--christmas-red);
  border-color: var(--christmas-green);
  background-color: var(--christmas-gold);
}

/* Couleurs hivernales */
.my-header {
  background-color: var(--snow-white);
  color: var(--ice-blue);
}
```

## Exemples de composants

### Carte avec effet hivernal

```tsx
export function WinterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="frost-effect rounded-xl p-6 border border-border winter-hover">
      {children}
    </div>
  );
}
```

### Bouton festif

```tsx
export function FestiveButton({ children, onClick }: { 
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button 
      onClick={onClick}
      className="winter-sparkle bg-primary text-primary-foreground px-4 py-2 rounded-lg winter-hover"
    >
      {children}
    </button>
  );
}
```

### Badge de Noël

```tsx
export function ChristmasBadge({ label }: { label: string }) {
  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm winter-sparkle"
      style={{ backgroundColor: 'var(--christmas-red)', color: 'white' }}
    >
      🎄 {label}
    </span>
  );
}
```

### Section avec neige

```tsx
export function SnowSection({ children, title }: { 
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="frost-effect p-8 rounded-2xl my-8">
      <h2 className="text-2xl font-bold mb-4 winter-sparkle">
        ❄️ {title}
      </h2>
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}
```

## Intégration dans les pages existantes

### Page d'accueil

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 winter-sparkle">
        🎄 Bienvenue sur Joutes
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="frost-effect p-6 rounded-xl winter-hover">
          <h2>Événements</h2>
          <p>Découvrez les prochains événements</p>
        </div>
        
        <div className="frost-effect p-6 rounded-xl winter-hover">
          <h2>Ligues</h2>
          <p>Rejoignez une ligue</p>
        </div>
        
        <div className="frost-effect p-6 rounded-xl winter-hover">
          <h2>Lairs</h2>
          <p>Trouvez un lieu de jeu</p>
        </div>
      </div>
    </div>
  );
}
```

## Personnalisation avancée

### Créer vos propres décorations

```tsx
// components/CustomWinterDecor.tsx
'use client';

export function CustomWinterDecor() {
  return (
    <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
      <div className="flex justify-center items-end h-20">
        {/* Tas de neige */}
        <div className="text-6xl">
          ⛄⛄⛄
        </div>
      </div>
    </div>
  );
}
```

### Modifier l'intensité des flocons

```tsx
// components/WinterDecorations.tsx
// Modifier le nombre de flocons dans la boucle :
for (let i = 0; i < 100; i++) { // Au lieu de 50
  // ...
}
```

### Désactiver certaines décorations

```tsx
// Dans layout.tsx, vous pouvez importer sélectivement :
const WinterDecorations = isWinterTheme
  ? dynamic(() => import("@/components/WinterDecorations"), { 
      ssr: false 
    })
  : () => null;

// Ou créer une version allégée sans certaines décorations
```

## Astuces

1. **Performance** : Les décorations sont optimisées mais vous pouvez réduire le nombre de flocons sur mobile
2. **Accessibilité** : Les animations peuvent être désactivées avec `prefers-reduced-motion`
3. **Saisonnalité** : Vous pouvez programmer l'activation automatique du thème pendant les fêtes
4. **Variations** : Créez d'autres thèmes (printemps, été, automne) en suivant le même modèle

