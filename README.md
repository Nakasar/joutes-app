# Developers

## Setup

### MongoDB (collection database)

- Run mongo container:
```bash
podman volume create mongo_data
podman run -d -it --rm \
  -p 27017:27017 \
  -v mongo_data:/data/db \
  --name mongo \
  mongo
```

### Thème Hivernal 🎄❄️

L'application supporte un thème hivernal festif avec décorations de Noël et d'hiver.

Pour activer le thème hivernal, définissez la variable d'environnement :
```bash
NEXT_PUBLIC_THEME=winter
```

Consultez la documentation complète : [docs/WINTER_THEME.md](docs/WINTER_THEME.md)

Pour voir une démo du thème : `/winter-demo`

## Fonctionnalités

### Historique des Parties

Les utilisateurs peuvent enregistrer et consulter l'historique de leurs parties jouées.

Pour plus de détails, voir [docs/GAME_MATCHES.md](docs/GAME_MATCHES.md).

### Signalement de contenus

Les utilisateurs connectés peuvent signaler les contenus créés par d'autres utilisateurs (bouton drapeau). Les administrateurs les traitent depuis `/admin/reports`.

Pour plus de détails, voir [docs/REPORTS.md](docs/REPORTS.md).

### Erratas

Tout utilisateur connecté peut créer un errata ; chacun ne peut modifier ou supprimer que les siens, sauf permission `erratas:manage`.

Pour plus de détails, voir [docs/ERRATAS.md](docs/ERRATAS.md).

### Foil et variantes d'impression

Une carte peut être marquée « toujours foil » et porter une liste de variantes d'impression (promo pack, pre-release, judge…), avec une image propre optionnelle.

Pour plus de détails, voir [docs/CARD_PRINTINGS.md](docs/CARD_PRINTINGS.md).

### Documents d'export hors ligne

Chaque jeu expose un document JSON (cartes, erratas, policies, règles) que les clients téléchargent pour fonctionner hors ligne. Il est généré en flux, une génération à la fois par jeu.

Pour plus de détails, voir [docs/GAME_EXPORTS.md](docs/GAME_EXPORTS.md).
