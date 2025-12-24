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

