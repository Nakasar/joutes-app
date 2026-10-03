import type { IndexDefinition } from "./ensure";

/**
 * Cartes, collections, listes et decks.
 *
 * `cards.id` n'est **pas** unique : le catalogue porte une ligne par langue
 * sous le même `id`. Aucun de ces index ne l'est donc.
 */
export const CARD_INDEXES: IndexDefinition[] = [
  {
    collection: "cards",
    keys: { id: 1, gameId: 1 },
    why: "Le `$lookup cardId → id` de chaque page de collection, et la fiche d'une carte",
  },
  {
    collection: "cards",
    keys: { gameId: 1, setCode: 1, collectorNumber: 1 },
    why: "Une impression par extension et numéro ; les lectures et `distinct` par jeu",
  },
  {
    collection: "cards",
    keys: { gameId: 1, type: 1 },
    why: "Le `distinct type` et le filtre par type des pages de collection",
  },
  {
    collection: "cards",
    keys: { name: 1, gameId: 1 },
    why: "Une carte par son nom exact (errata, échanges, vérificateur de deck, Discord, MCP)",
  },
  {
    collection: "cards",
    keys: { gameId: 1, name: 1 },
    options: { collation: { locale: "en", strength: 2 }, name: "gameId_1_name_1_en_2" },
    why: "La même recherche par nom, insensible à la casse (import de deck et de cube)",
  },
  {
    collection: "cards",
    keys: { orientation: 1 },
    options: { partialFilterExpression: { orientation: "landscape" } },
    why: "Les cartes à l'italienne, cherchées à chaque liste d'exemplaires",
  },

  // Un exemplaire appartient à une personne **ou** à un groupe. Les index ne
  // sont pas partiels pour autant : les `$lookup` du catalogue filtrent par
  // `$expr`, dont le planificateur ne déduit pas un `$exists`, et un index
  // partiel y serait ignoré.
  {
    collection: "collection-cards",
    keys: { userId: 1, cardId: 1 },
    why: "La collection d'une personne, et ses exemplaires d'une carte",
  },
  {
    collection: "collection-cards",
    keys: { userId: 1, name: 1, setCode: 1, collectorNumber: 1 },
    why: "« Je possède » par nom et impression : variantes, échanges",
  },
  {
    collection: "collection-cards",
    keys: { playGroupId: 1, cardId: 1 },
    why: "La collection d'un groupe de jeu",
  },
  {
    collection: "collection-cards",
    keys: { playGroupId: 1, name: 1, setCode: 1, collectorNumber: 1 },
    why: "« Le groupe possède » par nom et impression",
  },
  {
    collection: "collection-cards",
    keys: { cardId: 1 },
    why: "Les amis qui possèdent une carte (`cardId` puis `$or` des propriétaires)",
  },

  {
    collection: "boosters",
    keys: { userId: 1, gameId: 1, createdAt: -1 },
    why: "Les boosters ouverts d'une personne sur un jeu",
  },
  {
    collection: "booster-cards",
    keys: { boosterId: 1 },
    why: "Le contenu d'un booster",
  },
  {
    collection: "booster-cards",
    keys: { userId: 1, cardId: 1 },
    why: "Filtre « boosters contenant cette carte » : branche par identifiant",
  },
  {
    collection: "booster-cards",
    keys: { userId: 1, setCode: 1, collectorNumber: 1 },
    why: "Filtre « boosters contenant cette carte » : branche par impression",
  },

  {
    collection: "card-prices",
    keys: { gameId: 1, cardId: 1, source: 1 },
    options: { unique: true, name: "gameId_cardId_source_unique" },
    why: "Un prix par carte et par source ; clé de l'upsert de l'import",
  },
  {
    collection: "card-prices",
    keys: { gameId: 1, source: 1 },
    options: { name: "gameId_source" },
    why: "Le décompte des prix d'une source",
  },

  {
    collection: "erratas",
    keys: { cardIds: 1 },
    why: "Les errata d'une carte",
  },
  {
    collection: "erratas",
    keys: { cardId: 1 },
    options: { sparse: true },
    why: "Branche historique (`cardId` seul) de la même recherche",
  },
  {
    collection: "errata-votes",
    keys: { errataId: 1, userId: 1 },
    why: "Le vote d'une personne, et le décompte d'un errata",
  },
  {
    collection: "policy-votes",
    keys: { policyId: 1, userId: 1 },
    why: "Le vote d'une personne, et le décompte d'une règle",
  },
  {
    collection: "policies",
    keys: { gameId: 1, title: 1, createdAt: -1 },
    why: "Les règles d'un jeu, par titre",
  },

  {
    collection: "wishlist-items",
    keys: { wishlistId: 1, createdAt: -1 },
    why: "Le contenu paginé d'une liste de souhaits",
  },
  {
    collection: "wishlist-items",
    keys: { wishlistId: 1, cardId: 1 },
    why: "L'ajout d'une carte (upsert), et « les listes qui contiennent cette carte »",
  },

  {
    collection: "sellLists",
    keys: { ownerType: 1, ownerId: 1 },
    options: { unique: true },
    why: "Une liste par propriétaire ; sert la lecture d'une liste et le filtre « vend » du registre",
  },
  {
    collection: "sellListItems",
    keys: { collectionEntryId: 1 },
    options: { unique: true },
    why: "Un exemplaire de collection ne se met en vente qu'une fois ; sert aussi les retraits en cascade",
  },
  {
    collection: "sellListItems",
    keys: { sellListId: 1, gameId: 1 },
    why: "Le contenu d'une liste restreint à un jeu",
  },
  {
    collection: "sellListItems",
    keys: { sellListId: 1, createdAt: -1 },
    why: "Le contenu paginé d'une liste de vente",
  },

  {
    collection: "products",
    keys: { gameId: 1, id: 1 },
    options: { unique: true, name: "gameId_id_unique" },
    why: "Un produit par identifiant et par jeu — à poser avant le moindre import",
  },
  {
    collection: "products",
    keys: { gameId: 1, setCode: 1 },
    options: { name: "gameId_setCode" },
    why: "Les produits d'une extension",
  },
  {
    collection: "products",
    keys: { gameId: 1, kind: 1 },
    options: { name: "gameId_kind" },
    why: "Les produits d'un type",
  },
  {
    collection: "products",
    keys: { gameId: 1, name: 1 },
    options: { name: "gameId_name" },
    why: "Les produits par nom",
  },
  {
    collection: "products",
    keys: { gameId: 1, "contents.productId": 1 },
    options: { name: "gameId_contents" },
    why: "« Présent dans » : les boîtes dont le contenu cite une figurine",
  },
  {
    collection: "collection-products",
    keys: { userId: 1, gameId: 1 },
    options: { name: "userId_gameId" },
    why: "Les produits d'une personne sur un jeu",
  },
  {
    collection: "collection-products",
    keys: { playGroupId: 1, gameId: 1 },
    options: { name: "playGroupId_gameId" },
    why: "Les produits d'un groupe sur un jeu",
  },
  {
    collection: "collection-products",
    keys: { userId: 1, productId: 1 },
    options: { name: "userId_productId" },
    why: "Les exemplaires d'un produit",
  },
  {
    collection: "collection-products",
    keys: { fromProductEntryId: 1 },
    options: { name: "fromProductEntryId" },
    why: "Retrait d'un conteneur : on efface d'un coup ce qu'il a apporté",
  },

  // `createDeckIndexes` (lib/db/decks.ts) n'est appelé nulle part : ces index
  // n'existent que s'ils ont été posés à la main.
  {
    collection: "decks",
    keys: { playerId: 1, name: 1 },
    options: { unique: true },
    why: "Un nom de deck par joueur ; sert aussi « mes decks »",
  },
  {
    collection: "decks",
    keys: { playerId: 1, updatedAt: -1 },
    why: "Les decks d'un joueur, du plus récent au plus ancien",
  },
  {
    collection: "decks",
    keys: { visibility: 1, gameId: 1, updatedAt: -1 },
    why: "La bibliothèque publique d'un jeu, triée par mise à jour",
  },
  {
    collection: "decks",
    keys: { visibility: 1, gameId: 1, favoritesCount: -1, updatedAt: -1 },
    why: "La bibliothèque publique d'un jeu, triée par popularité",
  },
  {
    collection: "decks",
    keys: { visibility: 1, legendCardId: 1 },
    why: "Le filtre et les facettes par légende",
  },
  {
    collection: "decks",
    keys: { favoritedBy: 1 },
    why: "Les decks favoris d'une personne",
  },

  {
    collection: "cubes",
    keys: { ownerId: 1, updatedAt: -1 },
    why: "Les cubes d'une personne",
  },
  {
    collection: "cubes",
    keys: { visibility: 1, gameId: 1, updatedAt: -1 },
    why: "Les cubes publics d'un jeu",
  },
  {
    collection: "cube-packs",
    keys: { cubeId: 1, createdAt: 1 },
    why: "Les paquets d'un cube",
  },
  {
    collection: "cube-cards",
    keys: { packId: 1, createdAt: 1, _id: 1 },
    why: "Les cartes d'un paquet, dans l'ordre",
  },
  {
    collection: "cube-cards",
    keys: { cubeId: 1, createdAt: 1 },
    why: "Les cartes d'un cube (tirage, statistiques)",
  },

  {
    collection: "news",
    keys: { gameIds: 1, createdAt: -1 },
    why: "Les actualités d'un ou plusieurs jeux",
  },
  {
    collection: "news",
    keys: { createdAt: -1 },
    why: "Le fil d'actualités tous jeux confondus",
  },
  {
    collection: "quizzes",
    keys: { gameId: 1, createdAt: -1 },
    why: "Les quiz d'un jeu",
  },
];
