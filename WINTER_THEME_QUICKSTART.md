# 🎄 Guide Rapide - Thème Hivernal

## Activation rapide

### Méthode 1 : npm scripts (recommandé)
```bash
# Activer le thème hivernal
npm run theme:winter

# Revenir au thème par défaut
npm run theme:default

# Puis redémarrer le serveur
npm run dev
```

### Méthode 2 : Variable d'environnement
Créez un fichier `.env.local` avec :
```
NEXT_PUBLIC_THEME=winter
```

### Méthode 3 : Script interactif
```bash
./scripts/toggle-winter-theme.sh
```

## Voir le thème en action

1. Activez le thème avec une des méthodes ci-dessus
2. Démarrez ou redémarrez le serveur : `npm run dev`
3. Visitez : http://localhost:3000/winter-demo

## Ce qui change avec le thème hivernal

✨ **Visuellement :**
- Palette de couleurs bleue glacée et blanche neigeuse
- 50 flocons de neige animés qui tombent
- Décorations de Noël (sapins 🎄, étoiles ⭐, cadeaux 🎁, cloches 🔔)
- Guirlande festive en haut de la page
- Effets de givre sur les cartes
- Animations de scintillement

🎨 **Classes CSS disponibles :**
- `.frost-effect` - Effet de verre givré
- `.winter-sparkle` - Animation de scintillement
- `.winter-hover` - Effet lumineux au survol
- Variables CSS : `--christmas-red`, `--christmas-green`, `--christmas-gold`, `--ice-blue`, `--snow-white`

📱 **Optimisations :**
- Moins de flocons sur mobile (20 au lieu de 50)
- Décorations masquées sur petit écran
- Support du mode `prefers-reduced-motion` pour l'accessibilité

## Désactivation

Pour revenir au thème par défaut :
```bash
npm run theme:default
# Puis redémarrer le serveur
```

## Personnalisation

Consultez `docs/WINTER_THEME_EXAMPLES.md` pour :
- Exemples d'utilisation des classes CSS
- Composants réutilisables
- Personnalisation avancée

## Déploiement

Sur Vercel, ajoutez la variable d'environnement dans les paramètres :
- Clé : `NEXT_PUBLIC_THEME`
- Valeur : `winter`
- Environnements : Production, Preview, Development (selon besoin)

## Support

- Documentation complète : `docs/WINTER_THEME.md`
- Exemples de code : `docs/WINTER_THEME_EXAMPLES.md`
- Page de démo : `/winter-demo`

