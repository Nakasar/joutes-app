````markdown
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

## Fonctionnalités

### Historique des Parties

Les utilisateurs peuvent enregistrer et consulter l'historique de leurs parties jouées.

Pour plus de détails, voir [docs/GAME_MATCHES.md](docs/GAME_MATCHES.md).

````
