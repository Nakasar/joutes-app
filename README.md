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

Les utilisateurs peuvent enregistrer et consulter l'historique de leurs parties jouées, avec ou sans compte pour les autres participants (joueurs invités).

Pour plus de détails, voir [docs/GAME_MATCHES.md](docs/GAME_MATCHES.md).

### Rapports de bataille (jeux de figurines)

Les parties des jeux qui l'activent se saisissent en rapport de bataille : liste d'armée de chaque joueur (avec autocomplétion des figurines du catalogue), scénario joué, fiche de notes libres, et une table de jeu vue de dessus où l'on pose décor et unités, instant par instant.

Pour plus de détails, voir [docs/BATTLE_REPORTS.md](docs/BATTLE_REPORTS.md).

### Signalement de contenus

Les utilisateurs connectés peuvent signaler les contenus créés par d'autres utilisateurs (bouton drapeau). Les administrateurs les traitent depuis `/admin/reports`.

Pour plus de détails, voir [docs/REPORTS.md](docs/REPORTS.md).

### Erratas

Tout utilisateur connecté peut créer un errata ; chacun ne peut modifier ou supprimer que les siens, sauf permission `erratas:manage`.

Pour plus de détails, voir [docs/ERRATAS.md](docs/ERRATAS.md).

### Collection de produits (jeux de figurines)

Les jeux qui ne se jouent pas avec des cartes ont leur propre catalogue : boîtes, figurines et accessoires, gérés depuis `/admin/products` et activés par la fonctionnalité « Produits » de la fiche du jeu. Une boîte déclare ce qu'elle contient ; l'ajouter à sa collection y verse ses figurines, et une boîte dont on possède déjà tout le contenu est signalée comme telle.

Pour plus de détails, voir [docs/COLLECTION_PRODUCTS.md](docs/COLLECTION_PRODUCTS.md).

### Foil et variantes d'impression

Une carte peut être marquée « toujours foil » et porter une liste de variantes d'impression (promo pack, pre-release, judge…), avec une image propre optionnelle.

Pour plus de détails, voir [docs/CARD_PRINTINGS.md](docs/CARD_PRINTINGS.md).

### Documents d'export hors ligne

Chaque jeu expose un document JSON (cartes, erratas, policies, règles) que les clients téléchargent pour fonctionner hors ligne. Il est généré en flux, une génération à la fois par jeu.

Pour plus de détails, voir [docs/GAME_EXPORTS.md](docs/GAME_EXPORTS.md).

### Import d'une actualité depuis un site extérieur

Une actualité peut être reprise d'un article publié ailleurs — la FAQ d'une sortie sur le site officiel, par exemple — en gardant sa mise en page et ses images, avec les noms de cartes mis en forme comme ailleurs sur Joutes. La source est citée et liée sur l'actualité.

Pour plus de détails, voir [docs/NEWS_IMPORT.md](docs/NEWS_IMPORT.md).

### Traduction des actualités

Une actualité est écrite dans une langue et peut être traduite dans les autres. `/news/:newsId` la sert dans la langue de l'interface du lecteur ; `/news/:newsId/:lang` sert une langue précise, et chacune a donc son adresse partageable.

Pour plus de détails, voir [docs/NEWS_TRANSLATIONS.md](docs/NEWS_TRANSLATIONS.md).
