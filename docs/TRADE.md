# Fonctionnalité : Interface d'échange

## Vue d'ensemble

L'interface d'échange (`/trade`) permet à un utilisateur connecté de préparer un échange de cartes
avec un partenaire, puis de l'appliquer à sa collection en une seule opération : les cartes cédées
sont retirées de la collection, les cartes reçues y sont ajoutées.

L'échange n'est pas limité à un jeu : les deux espaces cherchent des cartes **tous jeux confondus**,
avec un filtre facultatif par jeu.

## Interface utilisateur

La page présente deux espaces côte à côte (empilés sur mobile) :

| Espace | Contenu | Source de recherche par défaut |
| --- | --- | --- |
| Gauche — « Mon offre » | Les cartes cédées, retirées de la collection | **Ma collection** (cartes possédées uniquement) |
| Droite — « Ce que je reçois » | Les cartes reçues, ajoutées à la collection | **Toutes les cartes** (catalogue complet) |

Chaque espace propose :

- un sélecteur de source (**Ma collection** / **Toutes les cartes**) — la valeur par défaut diffère
  entre les deux espaces mais peut être changée ;
- un champ de recherche par nom (debounce de 300 ms, requêtes en vol annulées) ;
- un filtre par jeu (« Tous les jeux » par défaut) ;
- une liste de résultats paginée, chaque résultat indiquant l'extension, le numéro de collecteur, le
  jeu et le nombre d'exemplaires possédés ;
- la liste des cartes retenues, avec une quantité ajustable et un retrait.

Recherche dans la collection : une recherche vide liste toute la collection. Recherche dans le
catalogue : au moins 2 caractères sont requis, le catalogue couvrant tous les jeux.

### Garde-fous

- Côté « mon offre », une carte n'est ajoutable qu'à hauteur des exemplaires réellement possédés
  (bouton désactivé au-delà, ou si la carte n'est pas possédée lorsque la recherche porte sur tout le
  catalogue).
- Côté cartes reçues, seule une carte connue du catalogue est ajoutable : c'est lui qui fournit les
  données réellement insérées en collection.
- Le bouton **Échanger** ouvre une **modale de confirmation** récapitulant les deux faces de
  l'échange. L'échange n'est appliqué qu'après confirmation.

## Modèle de données

Aucune nouvelle collection MongoDB : l'échange agit directement sur `collection-cards`.

Les deux faces manipulent des identités différentes, ce qui est volontaire :

- une **carte cédée** est identifiée par `(name, setCode, collectorNumber)`, les trois champs
  dénormalisés sur `collection-cards` à l'écriture. C'est l'identité utilisée par le reste du code
  pour compter les exemplaires possédés, `cards.id` n'étant pas strictement unique (voir la note de
  `lib/db/collection.ts`) ;
- une **carte reçue** est identifiée par son `cards.id` de catalogue, seule source des données
  insérées (`name`, `setCode`, `collectorNumber`, `image`), afin de ne rien insérer sur la base de
  données envoyées par le client.

Les exemplaires ajoutés reçoivent un `obtainedAt` à la date du jour.

### Sélection des exemplaires retirés

Pour une carte cédée en `n` exemplaires, `n` documents `collection-cards` sont supprimés, en plaçant
les exemplaires marqués prêtés (`borrowedBy`) en dernier : un échange porte en priorité sur des
cartes effectivement en main. Les éventuelles annonces de vente liées aux exemplaires retirés sont
supprimées en cascade (`removeSellListItemsByCollectionEntryIds`).

### Cohérence

Les deux faces sont entièrement validées avant la moindre écriture (cartes reçues présentes au
catalogue, exemplaires cédés réellement possédés). MongoDB pouvant tourner en standalone en
développement — donc sans transactions — les insertions sont faites avant les suppressions et
annulées si la suppression échoue : une erreur ne peut pas faire disparaître de cartes de la
collection.

## API

### `GET /api/trade/cards`

Recherche de cartes pour l'interface d'échange (authentification requise).

| Paramètre | Valeurs | Défaut | Description |
| --- | --- | --- | --- |
| `scope` | `collection` \| `catalog` | `collection` | Cartes possédées ou catalogue complet |
| `q` | texte | — | Recherche par nom (2 caractères minimum en `catalog`) |
| `gameId` | ObjectId | — | Restreint à un jeu |
| `page` | entier ≥ 1 | `1` | Page demandée |
| `limit` | 1–48 | `24` | Taille de page |

Réponse : `{ items, total, page, limit, totalPages, needsQuery }`, chaque `item` portant
`{ key, cardId?, name, setCode, collectorNumber, image, type?, gameId?, gameName?, gameSlug?, owned }`.
`needsQuery` vaut `true` quand une recherche catalogue a été ignorée faute d'un terme assez long.

### `POST /api/trade`

Applique l'échange (authentification requise). Corps validé par `lib/schemas/trade.schema.ts` :

```json
{
  "offered": [{ "name": "…", "setCode": "…", "collectorNumber": "…", "quantity": 1 }],
  "received": [{ "cardId": "…", "quantity": 1 }]
}
```

Au moins une carte est requise, toutes faces confondues ; 50 lignes maximum par face et 99
exemplaires par ligne.

Réponses :

- `200` — `{ removed, added }` (nombres d'exemplaires retirés et ajoutés) ;
- `400` — corps invalide, ou `{ error: "unknown-cards", details: [cardId] }` si une carte reçue est
  inconnue du catalogue ;
- `409` — `{ error: "insufficient-copies", details: [{ name, setCode, collectorNumber, requested, owned }] }`
  si les exemplaires cédés ne sont plus possédés en quantité suffisante (le stock a pu changer depuis
  la recherche) ;
- `401` / `500` — non connecté / erreur serveur.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `app/trade/page.tsx` | Page serveur (`/trade`), redirige vers `/login` si non connecté |
| `app/trade/TradeClient.tsx` | État des deux faces, modale de confirmation, appel de l'API |
| `app/trade/TradePanel.tsx` | Un espace : recherche, résultats paginés, cartes retenues |
| `app/api/trade/cards/route.ts` | Recherche de cartes |
| `app/api/trade/route.ts` | Application de l'échange |
| `lib/db/trades.ts` | Recherche (`searchTradeCards`), application (`executeTrade`), jeux (`listTradeGames`) |
| `lib/schemas/trade.schema.ts` | Validation Zod du corps de `POST /api/trade` |

## Navigation

Le lien **Échange** est ajouté au menu « Ma collection » du header (desktop, tablette et mobile),
aux côtés de la collection, des listes de souhaits et de la liste de vente.

## Traductions

Namespace `Trade` dans `messages/{fr,en,it,de}.json`, plus l'entrée `Header.menu.Trade`.
