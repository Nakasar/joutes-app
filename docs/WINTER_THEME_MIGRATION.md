# Migration des Pages Existantes vers le Thème Hivernal

Ce guide explique comment adapter les pages existantes de l'application pour qu'elles bénéficient pleinement du thème hivernal.

## Approche Non-Intrusive

Le thème hivernal est conçu pour être **non-intrusif** : 
- Les pages existantes fonctionnent sans modification
- Les couleurs s'adaptent automatiquement via les variables CSS
- Vous pouvez ajouter progressivement les effets hivernaux

## Amélioration Progressive

### Niveau 1 : Aucune modification (Fonctionnel)
Les pages existantes utilisent déjà les variables CSS, donc les couleurs s'adaptent automatiquement.

```tsx
// Aucune modification nécessaire, ça fonctionne déjà !
<div className="bg-background text-foreground p-4">
  <h1 className="text-primary">Titre</h1>
</div>
```

### Niveau 2 : Ajout d'effets légers
Ajoutez simplement les classes utilitaires pour les effets :

```tsx
// Avant
<div className="rounded-lg p-6 border">
  Contenu
</div>

// Après (avec effets hivernaux)
<div className="rounded-lg p-6 border winter-hover">
  Contenu
</div>
```

### Niveau 3 : Effets de givre
Ajoutez l'effet de givre aux éléments importants :

```tsx
// Avant
<div className="bg-card rounded-xl p-8">
  Carte importante
</div>

// Après
<div className="frost-effect rounded-xl p-8">
  Carte importante
</div>
```

### Niveau 4 : Scintillement festif
Ajoutez des animations aux éléments clés :

```tsx
// Avant
<h1 className="text-4xl font-bold">
  Titre de la page
</h1>

// Après
<h1 className="text-4xl font-bold winter-sparkle">
  ❄️ Titre de la page
</h1>
```

## Exemples par Type de Page

### Page d'Événements

```tsx
// app/events/page.tsx
export default function EventsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 winter-sparkle">
        🎄 Événements
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map(event => (
          <div 
            key={event.id}
            className="frost-effect rounded-xl p-6 winter-hover"
          >
            <h2 className="text-xl font-semibold mb-2">{event.title}</h2>
            <p className="text-muted-foreground">{event.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Page de Profil

```tsx
// app/account/page.tsx
export default function AccountPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="frost-effect rounded-2xl p-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 winter-sparkle">
          ⭐ Mon Profil
        </h1>
        
        <div className="space-y-6">
          <div className="winter-hover p-4 rounded-lg bg-muted/30">
            <h3 className="font-semibold mb-2">Informations</h3>
            {/* Contenu du profil */}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Liste de Lairs

```tsx
// app/lairs/page.tsx
export default function LairsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold winter-sparkle">
          🏠 Lairs
        </h1>
      </header>
      
      <div className="space-y-4">
        {lairs.map(lair => (
          <div 
            key={lair.id}
            className="frost-effect rounded-lg p-6 winter-hover flex items-center gap-4"
          >
            <div className="winter-sparkle text-3xl">🏰</div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{lair.name}</h3>
              <p className="text-muted-foreground">{lair.location}</p>
            </div>
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg winter-hover">
              Visiter
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Modal/Dialog

```tsx
// Composant modal
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function WinterModal({ children, ...props }) {
  return (
    <Dialog {...props}>
      <DialogContent className="frost-effect">
        <div className="winter-sparkle">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## Composants Réutilisables

Créez des composants wrapper pour une application cohérente :

### WinterCard.tsx
```tsx
import { cn } from '@/lib/utils';

interface WinterCardProps {
  children: React.ReactNode;
  className?: string;
  sparkle?: boolean;
}

export function WinterCard({ children, className, sparkle }: WinterCardProps) {
  return (
    <div 
      className={cn(
        'frost-effect rounded-xl p-6 winter-hover',
        sparkle && 'winter-sparkle',
        className
      )}
    >
      {children}
    </div>
  );
}
```

### WinterButton.tsx
```tsx
import { cn } from '@/lib/utils';

interface WinterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'festive';
  children: React.ReactNode;
}

export function WinterButton({ 
  variant = 'primary', 
  children, 
  className,
  ...props 
}: WinterButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg winter-hover transition-all',
        variant === 'primary' && 'bg-primary text-primary-foreground',
        variant === 'festive' && 'winter-sparkle',
        className
      )}
      style={variant === 'festive' ? {
        backgroundColor: 'var(--christmas-red)',
        color: 'white'
      } : undefined}
      {...props}
    >
      {children}
    </button>
  );
}
```

## Checklist de Migration

Pour chaque page que vous souhaitez améliorer :

- [ ] Ajouter des emojis festifs aux titres (🎄 ❄️ ⭐ 🎁)
- [ ] Remplacer les `bg-card` par `frost-effect` pour les cartes principales
- [ ] Ajouter `winter-hover` aux éléments interactifs
- [ ] Ajouter `winter-sparkle` aux titres et éléments clés
- [ ] Utiliser les variables CSS festives pour les accents spéciaux
- [ ] Tester en mode clair et sombre

## Conditional Rendering (Optionnel)

Si vous voulez du contenu spécifique au thème hivernal :

```tsx
// lib/utils/theme.ts
export function isWinterTheme() {
  return process.env.NEXT_PUBLIC_THEME === 'winter';
}

// Dans vos composants
import { isWinterTheme } from '@/lib/utils/theme';

export function MyComponent() {
  const winter = isWinterTheme();
  
  return (
    <div>
      <h1>
        {winter ? '🎄 ' : ''}
        Titre
        {winter ? ' ❄️' : ''}
      </h1>
    </div>
  );
}
```

## Bonnes Pratiques

1. **Gardez la simplicité** : N'ajoutez pas d'effets partout, soyez sélectif
2. **Hiérarchie visuelle** : Réservez les effets forts (sparkle) aux éléments importants
3. **Cohérence** : Utilisez les mêmes patterns sur toutes les pages
4. **Accessibilité** : Les effets respectent `prefers-reduced-motion`
5. **Performance** : Les décorations sont optimisées pour ne pas ralentir l'app

## Retour en Arrière

Si vous décidez de désactiver le thème, toutes vos pages fonctionneront normalement car :
- Les classes `frost-effect`, `winter-hover`, `winter-sparkle` n'ont aucun effet sans le thème
- Les variables CSS reviennent aux valeurs par défaut
- Les emojis restent mais peuvent être retirés progressivement

