# Exemples d'Utilisation des Composants Hivernaux

## Import des composants

```tsx
import { 
  WinterCard, 
  WinterButton, 
  WinterBadge, 
  WinterHeading, 
  WinterSection 
} from '@/components/ui/winter';
```

## WinterCard

Carte automatiquement stylisée avec effets hivernaux quand le thème est actif.

```tsx
// Usage basique
<WinterCard>
  <h3>Titre de la carte</h3>
  <p>Contenu de la carte</p>
</WinterCard>

// Avec scintillement
<WinterCard sparkle>
  <h3>Carte importante</h3>
  <p>Cette carte scintille !</p>
</WinterCard>

// Sans effet de givre
<WinterCard frost={false}>
  <h3>Carte simple</h3>
  <p>Pas d'effet de givre</p>
</WinterCard>

// Personnalisé
<WinterCard className="bg-gradient-to-br from-blue-50 to-white">
  <h3>Carte avec gradient custom</h3>
</WinterCard>
```

## WinterButton

Boutons avec effets hivernaux.

```tsx
// Bouton primary
<WinterButton>
  Cliquez-moi
</WinterButton>

// Bouton festif (rouge Noël)
<WinterButton variant="festive">
  🎄 Action festive
</WinterButton>

// Avec scintillement
<WinterButton sparkle>
  ✨ Bouton spécial
</WinterButton>

// Bouton secondary
<WinterButton variant="secondary">
  Action secondaire
</WinterButton>

// Avec onClick
<WinterButton onClick={() => alert('Ho ho ho!')}>
  Surprise !
</WinterButton>
```

## WinterBadge

Badges avec couleurs festives.

```tsx
// Badge par défaut
<WinterBadge>Nouveau</WinterBadge>

// Badge rouge Noël
<WinterBadge variant="christmas-red">
  🎁 Spécial Noël
</WinterBadge>

// Badge vert Noël
<WinterBadge variant="christmas-green">
  🎄 Événement festif
</WinterBadge>

// Badge doré
<WinterBadge variant="christmas-gold">
  ⭐ Premium
</WinterBadge>
```

## WinterHeading

Titres avec emojis conditionnels.

```tsx
// Titre H1 avec emoji
<WinterHeading level={1} emoji="❄️">
  Bienvenue
</WinterHeading>

// Titre H2
<WinterHeading level={2} emoji="🎄">
  Événements à venir
</WinterHeading>

// Sans emoji
<WinterHeading level={3}>
  Section sans décoration
</WinterHeading>

// Avec classes custom
<WinterHeading level={1} emoji="⭐" className="text-center">
  Titre centré
</WinterHeading>
```

## WinterSection

Section complète avec titre et effets.

```tsx
// Section avec titre
<WinterSection title="Mes Événements" titleEmoji="🎄">
  <p>Contenu de la section</p>
  <div>Plus de contenu...</div>
</WinterSection>

// Section sans titre
<WinterSection>
  <h3>Titre personnalisé</h3>
  <p>Contenu libre</p>
</WinterSection>

// Section avec emoji différent
<WinterSection title="Mes Lairs" titleEmoji="🏰">
  <ul>
    <li>Lair 1</li>
    <li>Lair 2</li>
  </ul>
</WinterSection>
```

## Exemple de Page Complète

```tsx
import { 
  WinterCard, 
  WinterButton, 
  WinterBadge, 
  WinterHeading, 
  WinterSection 
} from '@/components/ui/winter';

export default function ExamplePage() {
  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* En-tête */}
      <div className="text-center">
        <WinterHeading level={1} emoji="❄️">
          Ma Page d'Exemple
        </WinterHeading>
        <p className="text-muted-foreground mt-2">
          Découvrez les composants hivernaux en action
        </p>
      </div>

      {/* Section principale */}
      <WinterSection title="Événements à venir" titleEmoji="🎄">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <WinterCard>
            <WinterBadge variant="christmas-red">
              🎁 Spécial
            </WinterBadge>
            <h3 className="text-xl font-semibold mt-3 mb-2">
              Tournoi de Noël
            </h3>
            <p className="text-muted-foreground mb-4">
              Grand tournoi festif le 24 décembre
            </p>
            <WinterButton variant="festive">
              S'inscrire
            </WinterButton>
          </WinterCard>

          <WinterCard sparkle>
            <WinterBadge variant="christmas-gold">
              ⭐ Premium
            </WinterBadge>
            <h3 className="text-xl font-semibold mt-3 mb-2">
              Ligue d'Hiver
            </h3>
            <p className="text-muted-foreground mb-4">
              Rejoignez notre ligue saisonnière
            </p>
            <WinterButton>
              En savoir plus
            </WinterButton>
          </WinterCard>

          <WinterCard>
            <WinterBadge variant="christmas-green">
              🎄 Nouveau
            </WinterBadge>
            <h3 className="text-xl font-semibold mt-3 mb-2">
              Soirée Jeux
            </h3>
            <p className="text-muted-foreground mb-4">
              Venez jouer dans une ambiance festive
            </p>
            <WinterButton variant="secondary">
              Participer
            </WinterButton>
          </WinterCard>
        </div>
      </WinterSection>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <WinterButton sparkle>
          ✨ Action principale
        </WinterButton>
        <WinterButton variant="secondary">
          Voir tout
        </WinterButton>
      </div>
    </div>
  );
}
```

## Combinaisons Recommandées

### Carte d'événement important
```tsx
<WinterCard sparkle winterHover>
  <WinterBadge variant="christmas-gold">⭐ VIP</WinterBadge>
  <WinterHeading level={3} emoji="🎄">
    Événement Spécial
  </WinterHeading>
  <WinterButton variant="festive">
    Réserver maintenant
  </WinterButton>
</WinterCard>
```

### Section de profil utilisateur
```tsx
<WinterSection title="Mon Profil" titleEmoji="👤">
  <WinterCard frost={false} className="bg-muted/30">
    <div className="flex items-center gap-4">
      <div className="text-4xl">🎮</div>
      <div>
        <h3 className="font-semibold">Joueur Pro</h3>
        <WinterBadge variant="christmas-gold">
          Niveau 50
        </WinterBadge>
      </div>
    </div>
  </WinterCard>
</WinterSection>
```

### Liste d'actions
```tsx
<div className="space-y-3">
  <WinterCard className="flex items-center justify-between">
    <span>Créer un événement</span>
    <WinterButton variant="festive">
      🎄 Créer
    </WinterButton>
  </WinterCard>
  
  <WinterCard className="flex items-center justify-between">
    <span>Rejoindre une ligue</span>
    <WinterButton>
      Rejoindre
    </WinterButton>
  </WinterCard>
</div>
```

## Notes

- Tous les composants fonctionnent normalement quand le thème hivernal n'est **pas** activé
- Les effets sont appliqués automatiquement selon la variable `NEXT_PUBLIC_THEME`
- Vous pouvez toujours surcharger les styles avec `className`
- Les composants respectent les préférences d'accessibilité (`prefers-reduced-motion`)

