import db from "@/lib/mongodb";
import { User, UserShowcase } from "@/lib/types/User";
import { ObjectId } from "mongodb";
import { toUser } from "@/lib/users/document";
import { generateFriendCode } from "@/lib/utils/friend-codes";
import {
  type AdminUserSummary,
  parseAdminUserSearch,
} from "@/lib/users/admin-search";
import {
  REGISTRY_MAX_COUNT,
  type RegistryQuery,
  type RegistrySort,
  type RegistryUser,
  toRegistryUser,
} from "@/lib/users/registry-search";
import type { UserBadges } from "@/lib/db/user-badges";
import type { CardPricePreference } from "@/lib/types/card-price";

const COLLECTION_NAME = "user";

export async function getUserById(id: string): Promise<User | null> {
  if (!id) {
    return null;
  }

  const user = await db.collection(COLLECTION_NAME).findOne({ _id: ObjectId.createFromHexString(id) });
  return user ? toUser(user) : null;
}

export async function getUsersByIds(userIds: string[]): Promise<User[]> {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  const validIds = userIds.filter((id) => ObjectId.isValid(id));
  if (validIds.length === 0) {
    return [];
  }

  const objectIds = validIds.map((id) => ObjectId.createFromHexString(id));
  const users = await db
    .collection(COLLECTION_NAME)
    .find({ _id: { $in: objectIds } })
    .toArray();

  return users.map(toUser);
}

export async function getUserByEmail(email: string): Promise<User | null> {

  const user = await db.collection(COLLECTION_NAME).findOne({ email: email.toLowerCase() });
  return user ? toUser(user) : null;
}

// Génère un discriminant à 4 chiffres unique pour un displayName donné.
async function generateUniqueDiscriminator(displayName: string): Promise<string> {
  const collection = db.collection(COLLECTION_NAME);
  // On garde toujours le format à 4 chiffres (username#0000) : en cas de
  // collision on retente, jusqu'à épuisement raisonnable de l'espace.
  for (let i = 0; i < 50; i++) {
    const discriminator = Math.floor(1000 + Math.random() * 9000).toString();
    const existing = await collection.findOne(
      { displayName, discriminator },
      { collation: { locale: "en", strength: 2 } }
    );
    if (!existing) {
      return discriminator;
    }
  }
  throw new Error(`Impossible de générer un discriminateur unique pour "${displayName}"`);
}

/**
 * Crée un compte utilisateur « invité » à partir d'un email (ex: joueur ajouté
 * à un tournoi qui n'a pas encore de compte). Le nom d'utilisateur par défaut
 * est dérivé de la partie locale de l'email. `createdVia` trace l'origine.
 */
export async function createInvitedUserByEmail(
  email: string,
  createdVia: string
): Promise<User> {
  const normalizedEmail = email.toLowerCase();
  const username = (normalizedEmail.split("@")[0] || "joueur").slice(0, 100);
  const discriminator = await generateUniqueDiscriminator(username);

  const newUser = {
    username,
    displayName: username,
    discriminator,
    email: normalizedEmail,
    discordId: "",
    avatar: "",
    lairs: [],
    games: [],
    isPublicProfile: false,
    createdAt: new Date().toISOString(),
    createdVia,
  };

  const result = await db.collection(COLLECTION_NAME).insertOne(newUser);
  return toUser({ ...newUser, _id: result.insertedId });
}

export async function searchUsersByUsername(searchTerm: string): Promise<User[]> {
  
  const users = await db
    .collection(COLLECTION_NAME)
    .find({
      $or: [
        { username: { $regex: searchTerm, $options: "i" } },
        { displayName: { $regex: searchTerm, $options: "i" } },
      ],
    })
    .limit(10)
    .toArray();
  return users.map(toUser);
}

export async function getUserByUsernameAndDiscriminator(
  displayName: string,
  discriminator: string
): Promise<User | null> {
  
  const user = await db.collection(COLLECTION_NAME).findOne({
    displayName,
    discriminator,
  }, { collation: { locale: 'en', strength: 2 } });
  return user ? toUser(user) : null;
}

/**
 * Récupère un utilisateur par son nom d'utilisateur (username, ou tag displayName#discriminator)
 * @param username Le nom d'utilisateur ou tag renseigné
 * @returns L'utilisateur ou null si non trouvé
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  if (!username) {
    return null;
  }

  const parts = username.split('#');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const byTag = await getUserByUsernameAndDiscriminator(parts[0], parts[1]);
    if (byTag) {
      return byTag;
    }
  }

  const user = await db.collection(COLLECTION_NAME).findOne({
    $or: [{ name: username }, { username }],
  }, { collation: { locale: 'en', strength: 2 } });
  return user ? toUser(user) : null;
}

/**
 * Récupère un utilisateur par son code ami (partagé via QR code).
 */
export async function getUserByFriendCode(code: string): Promise<User | null> {
  if (!code) {
    return null;
  }

  const user = await db.collection(COLLECTION_NAME).findOne({ friendCode: code });
  return user ? toUser(user) : null;
}

const MAX_FRIEND_CODE_ATTEMPTS = 5;

/**
 * Récupère le code ami de l'utilisateur, ou lui en génère un s'il n'en a pas encore.
 */
export async function getOrCreateFriendCode(userId: string): Promise<string> {
  const objectId = ObjectId.createFromHexString(userId);
  const current = await db.collection(COLLECTION_NAME).findOne(
    { _id: objectId },
    { projection: { friendCode: 1 } }
  );
  if (current?.friendCode) {
    return current.friendCode;
  }

  for (let attempt = 0; attempt < MAX_FRIEND_CODE_ATTEMPTS; attempt++) {
    const code = generateFriendCode();
    const collision = await db.collection(COLLECTION_NAME).findOne(
      { friendCode: code },
      { projection: { _id: 1 } }
    );
    if (collision) {
      continue;
    }

    await db.collection(COLLECTION_NAME).updateOne({ _id: objectId }, { $set: { friendCode: code } });
    return code;
  }

  throw new Error("Impossible de générer un code ami unique");
}

/** Doit être appelée au moins une fois (ex. script de setup) pour garantir l'unicité des codes ami. */
export async function createUserFriendCodeIndex() {
  await db.collection(COLLECTION_NAME).createIndex({ friendCode: 1 }, { unique: true, sparse: true });
}

export type PublicUser = Pick<User, "id" | "username" | "displayName" | "discriminator" | "avatar"> & {
  /**
   * Palier et statuts, à montrer à côté du pseudonyme.
   *
   * Facultatif, et jamais rempli par `toPublicUser` : ce serait une lecture de
   * plus par utilisateur, donc un N+1 sur toute liste. L'appelant qui affiche
   * des badges les résout en lot par `getUserBadges` (`lib/db/user-badges.ts`),
   * en parallèle de la lecture des profils : les deux ne dépendent que des
   * mêmes identifiants.
   */
  badges?: UserBadges;
};

/**
 * Ne conserve que les champs publics d'un utilisateur, pour éviter d'exposer
 * des informations sensibles (email, discordId...) à d'autres utilisateurs.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    discriminator: user.discriminator,
    avatar: user.avatar,
  };
}

export type PublicUserProfile = PublicUser & {
  description: string | null;
  website: string | null;
  socialLinks: string[];
  isPublicProfile: boolean;
};

/**
 * Champs publics d'un profil utilisateur (page `/users/{tag}`). `description`,
 * `website` et `socialLinks` sont toujours inclus (choix explicite, non gated
 * par `isPublicProfile`) — c'est à l'appelant de décider s'il affiche aussi
 * les jeux/lieux suivis et les succès en fonction de `isPublicProfile`.
 */
export function toPublicUserProfile(user: User): PublicUserProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    discriminator: user.discriminator,
    avatar: user.profileImage || user.avatar,
    description: user.description ?? null,
    website: user.website ?? null,
    socialLinks: user.socialLinks ?? [],
    isPublicProfile: user.isPublicProfile ?? false,
  };
}

export async function updateUserGames(userId: string, games: string[]): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { games } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function addGameToUser(userId: string, gameId: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $addToSet: { games: gameId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeGameFromUser(userId: string, gameId: string): Promise<boolean> {

  const result = await db.collection<User>(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    // Le favori part avec le suivi : un jeu qu'on ne suit plus n'a rien à faire
    // en tête du menu, et un favori orphelin y resterait invisible et intouchable.
    { $pull: { games: gameId, favoriteGames: gameId } }
  );

  return result.modifiedCount > 0;
}

/**
 * Met un jeu en favori. Refusé si l'utilisateur ne suit pas ce jeu : le favori
 * se choisit parmi les jeux suivis, et un favori posé ailleurs serait retiré
 * à la lecture sans que personne comprenne pourquoi.
 */
export async function addFavoriteGameToUser(userId: string, gameId: string): Promise<boolean> {
  const result = await db.collection<User>(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId), games: gameId },
    { $addToSet: { favoriteGames: gameId } }
  );

  return result.matchedCount > 0;
}

export async function removeFavoriteGameFromUser(userId: string, gameId: string): Promise<boolean> {
  const result = await db.collection<User>(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $pull: { favoriteGames: gameId } }
  );

  return result.matchedCount > 0;
}

export async function updateUserLairs(userId: string, lairs: string[]): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { lairs } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function addLairToUser(userId: string, lairId: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $addToSet: { lairs: lairId } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

export async function removeLairFromUser(userId: string, lairId: string): Promise<boolean> {
  
  const result = await db.collection<User>(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $pull: { lairs: lairId } }
  );
  
  return result.modifiedCount > 0;
}

/**
 * Met à jour le nom d'utilisateur personnalisé (displayName) et génère un discriminateur si nécessaire
 * @param userId L'ID de l'utilisateur
 * @param displayName Le nouveau nom d'utilisateur personnalisé
 * @param discriminator Le discriminateur (optionnel, sera généré s'il n'existe pas)
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserDisplayName(
  userId: string,
  displayName: string,
  discriminator?: string
): Promise<boolean> {
  
  
  const updateData: { displayName: string; discriminator?: string } = {
    displayName,
  };
  
  // Ajouter le discriminateur seulement s'il est fourni
  if (discriminator) {
    updateData.discriminator = discriminator;
  }
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updateData }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Récupère le discriminateur d'un utilisateur
 * @param userId L'ID de l'utilisateur
 * @returns Le discriminateur ou null si non trouvé
 */
export async function getUserDiscriminator(userId: string): Promise<string | null> {
  
  const user = await db.collection(COLLECTION_NAME).findOne(
    { _id: ObjectId.createFromHexString(userId) },
    { projection: { discriminator: 1 } }
  );
  
  return user?.discriminator || null;
}

/**
 * Enregistre le fournisseur de prix qu'un joueur a choisi, et ce qu'il veut
 * pour les cartes que ce fournisseur ne cote pas.
 *
 * Le réglage se change depuis deux endroits — la page du compte et la fiche
 * d'une carte —, d'où un seul point d'écriture. `source` absent efface le
 * choix : le joueur revient à l'ordre de la plateforme, et le champ ne garde
 * pas un fournisseur qu'il ne suit plus.
 */
export async function updateUserPricePreference(
  userId: string,
  preference: CardPricePreference
): Promise<boolean> {
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    {
      $set: {
        pricePreference: {
          ...(preference.source ? { source: preference.source } : {}),
          fallback: preference.fallback !== false,
        },
      },
    }
  );

  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Met à jour la visibilité du profil de l'utilisateur
 * @param userId L'ID de l'utilisateur
 * @param isPublicProfile true pour rendre le profil public, false pour privé
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserProfileVisibility(
  userId: string,
  isPublicProfile: boolean
): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { isPublicProfile } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Récupère un utilisateur par son userTag (displayName#discriminator) ou son ID
 * @param userTagOrId Le userTag ou l'ID de l'utilisateur
 * @returns L'utilisateur ou null si non trouvé
 */
export async function getUserByTagOrId(userTagOrId: string): Promise<User | null> {
  
  // Vérifier si c'est un ID MongoDB valide
  if (ObjectId.isValid(userTagOrId) && userTagOrId.length === 24) {
    return getUserById(userTagOrId);
  }
  
  // Sinon, considérer que c'est un userTag (displayName#discriminator)
  const parts = userTagOrId.split('#');
  if (parts.length === 2) {
    const [displayName, discriminator] = parts;
    return getUserByUsernameAndDiscriminator(displayName, discriminator);
  }
  
  return null;
}

/**
 * Met à jour les informations publiques du profil
 * @param userId L'ID de l'utilisateur
 * @param description La description du profil
 * @param website Le site web
 * @param socialLinks Les liens vers les réseaux sociaux
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserProfileInfo(
  userId: string,
  data: {
    description?: string;
    website?: string;
    socialLinks?: string[];
  }
): Promise<boolean> {
  
  const updateData: Record<string, unknown> = {};
  
  if (data.description !== undefined) {
    updateData.description = data.description || null;
  }
  if (data.website !== undefined) {
    updateData.website = data.website || null;
  }
  if (data.socialLinks !== undefined) {
    updateData.socialLinks = data.socialLinks;
  }
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: updateData }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Met à jour l'image de profil de l'utilisateur
 * @param userId L'ID de l'utilisateur
 * @param profileImage L'URL de l'image de profil
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateUserProfileImage(
  userId: string,
  profileImage: string
): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { profileImage } }
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * `place` porte la localité d'où viennent les coordonnées, quand elles ont été
 * choisies dans une liste de villes. Une position relevée au GPS n'en a pas :
 * la localisation est alors enregistrée sans nom, comme avant.
 */
export async function updateUserLocation(
  userId: string,
  latitude: number | null,
  longitude: number | null,
  place?: { label?: string; city?: string; postalCode?: string } | null
): Promise<boolean> {

  let updateOperation;

  if (latitude === null || longitude === null) {
    // Supprimer la localisation
    updateOperation = { $unset: { location: "" } };
  } else {
    // Mettre à jour ou créer la localisation. Les champs de localité sont
    // écrits seulement s'ils existent : les omettre efface le nom d'une
    // localisation précédente, ce qui est le comportement voulu quand on la
    // remplace par une position GPS.
    updateOperation = {
      $set: {
        location: {
          latitude,
          longitude,
          ...(place?.label ? { label: place.label } : {}),
          ...(place?.city ? { city: place.city } : {}),
          ...(place?.postalCode ? { postalCode: place.postalCode } : {}),
        }
      }
    };
  }

  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    updateOperation
  );
  
  return result.modifiedCount > 0 || result.matchedCount > 0;
}

/**
 * Get all users who follow a specific lair
 * @param lairId - The lair's ID
 * @returns Array of users following the lair
 */
export async function getUsersFollowingLair(lairId: string): Promise<User[]> {
  
  const users = await db.collection(COLLECTION_NAME).find({
    lairs: lairId
  }).toArray();
  
  return users.map(toUser);
}

/**
 * Combien de joueurs suivent ce lieu.
 *
 * Un compte, et non la liste : la page publique n'affiche que le nombre, et
 * ramener tous les documents pour en mesurer la longueur coûterait la
 * collection entière sur un lieu populaire.
 */
export async function countUsersFollowingLair(lairId: string): Promise<number> {
  return db.collection(COLLECTION_NAME).countDocuments({ lairs: lairId });
}


/**
 * Remplace la description publique d'un profil par un texte de modération.
 * Utilisé par l'espace d'administration des signalements : le profil d'un
 * utilisateur n'est jamais supprimé, seule sa biographie est modérée.
 */
export async function moderateUserDescription(userId: string, moderatedText: string): Promise<boolean> {
  if (!ObjectId.isValid(userId)) {
    return false;
  }

  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    { $set: { description: moderatedText } }
  );

  return result.matchedCount > 0;
}

/**
 * Recherche d'utilisateurs pour l'administration : par identifiant, par tag
 * complet, ou par fragment de pseudonyme (cf. `lib/users/admin-search.ts`).
 *
 * La projection ne rapporte que de quoi afficher un pseudonyme et mener au
 * profil. L'adresse e-mail reste en base : elle n'a pas à traverser la
 * frontière du serveur pour dresser une liste de pseudonymes, et l'oubli d'un
 * champ à l'affichage ne peut alors plus la révéler.
 */
export async function searchUsersForAdmin(
  term: string,
  limit = 25
): Promise<AdminUserSummary[]> {
  const query = parseAdminUserSearch(term);
  if (!query) {
    return [];
  }

  const projection = {
    name: 1,
    username: 1,
    displayName: 1,
    discriminator: 1,
    image: 1,
    avatar: 1,
    isPublicProfile: 1,
  };

  // Le pseudonyme de compte vit sous `name` pour les comptes créés par
  // better-auth, et sous `username` pour les plus anciens : les deux se
  // cherchent, comme `toUser` les relit tous les deux.
  const filter =
    query.kind === "id"
      ? { _id: ObjectId.createFromHexString(query.id) }
      : query.kind === "tag"
        ? { displayName: query.displayName, discriminator: query.discriminator }
        : {
            $or: [
              { name: { $regex: query.pattern, $options: "i" } },
              { username: { $regex: query.pattern, $options: "i" } },
              { displayName: { $regex: query.pattern, $options: "i" } },
            ],
          };

  const cursor = db
    .collection(COLLECTION_NAME)
    .find(filter, { projection })
    .limit(Math.min(Math.max(limit, 1), 50));

  // Le tag se compare sans tenir compte de la casse, comme partout ailleurs où
  // on résout un `Pseudo#1234`.
  const docs = await (query.kind === "tag"
    ? cursor.collation({ locale: "en", strength: 2 })
    : cursor
  ).toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    username: doc.name || doc.username || "",
    displayName: doc.displayName || undefined,
    discriminator: doc.discriminator || undefined,
    avatar: doc.image || doc.avatar || undefined,
    isPublicProfile: doc.isPublicProfile === true,
  }));
}

/**
 * Le registre public : ce que la page « Communauté » cherche.
 *
 * Distinct de `searchUsersForAdmin`, et pas seulement par sa projection.
 * L'administration cherche **une** personne, dont elle connaît déjà quelque
 * chose ; le registre en parcourt beaucoup, dont il ne sait rien. D'où trois
 * différences de fond :
 *
 * - `isPublicProfile: true` est **dans la requête**, jamais laissé à
 *   l'affichage. Un profil privé figure au registre par son nom et ses badges
 *   (`readRegistryPrivateUsers`), mais il n'entre pas dans une recherche par
 *   ville ni par jeu : ce sont des informations qu'il a choisi de ne pas
 *   publier.
 * - L'identifiant n'est pas une clef de recherche : un registre public n'a pas
 *   à confirmer qu'un identifiant donné correspond à un compte.
 * - La ville se cherche, parce que c'est une des trois raisons qu'on a de
 *   parcourir un annuaire de joueurs.
 */
export type RegistryUserFilter = {
  query?: RegistryQuery | null;
  gameId?: string;
  city?: string;
  /**
   * Restreindre à ces comptes. Sert aux filtres que la collection `user` ne
   * porte pas — « vend des cartes », « en direct » — résolus ailleurs puis
   * croisés ici. Une liste **vide** ne veut pas dire « aucune restriction » :
   * elle veut dire « personne », et l'appelant n'a alors rien à demander.
   */
  userIds?: string[];
  sort: RegistrySort;
  limit: number;
  skip: number;
};

const REGISTRY_PROJECTION = {
  name: 1,
  username: 1,
  displayName: 1,
  discriminator: 1,
  image: 1,
  avatar: 1,
  profileImage: 1,
  description: 1,
  games: 1,
  isPublicProfile: 1,
  createdAt: 1,
  "location.city": 1,
  "showcase.showCity": 1,
} as const;

function registryFilter(filter: RegistryUserFilter): Record<string, unknown> | null {
  const conditions: Record<string, unknown>[] = [{ isPublicProfile: true }];

  if (filter.userIds) {
    if (filter.userIds.length === 0) {
      return null;
    }

    conditions.push({
      _id: { $in: filter.userIds.filter(ObjectId.isValid).map(ObjectId.createFromHexString) },
    });
  }

  if (filter.gameId) {
    conditions.push({ games: filter.gameId });
  }

  if (filter.city) {
    // La ville ne compte que si le compte a accepté de la montrer : la filtrer
    // sur un compte qui la garde pour lui reviendrait à la révéler par
    // recoupement.
    conditions.push({ "showcase.showCity": true, "location.city": filter.city });
  }

  if (filter.query?.kind === "tag") {
    conditions.push({
      displayName: filter.query.displayName,
      discriminator: filter.query.discriminator,
    });
  } else if (filter.query?.kind === "text") {
    const pattern = { $regex: filter.query.pattern, $options: "i" };
    conditions.push({
      $or: [
        { name: pattern },
        { username: pattern },
        { displayName: pattern },
        { "showcase.showCity": true, "location.city": pattern },
      ],
    });
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

const REGISTRY_SORT_ORDER: Record<RegistrySort, Record<string, 1 | -1>> = {
  // « Les plus actifs » se lit pour l'instant « les plus récents » : le dépôt
  // ne tient pas de trace d'activité par compte, et inventer un score qu'aucune
  // donnée ne soutient serait pire qu'un tri honnête.
  active: { createdAt: -1 },
  // Le classement par abonnés se fait dans `userFollowers`, la collection qui
  // porte le chiffre, puis arrive ici en liste d'identifiants : l'ordre du
  // `$in` n'étant pas garanti par Mongo, l'appelant le rétablit. Cette entrée
  // n'est donc qu'un départage stable.
  followers: { createdAt: -1 },
  name: { displayName: 1, name: 1 },
};

export async function searchPublicUsers(filter: RegistryUserFilter): Promise<RegistryUser[]> {
  const query = registryFilter(filter);
  if (!query) {
    return [];
  }

  const cursor = db
    .collection(COLLECTION_NAME)
    .find(query, { projection: REGISTRY_PROJECTION })
    .sort(REGISTRY_SORT_ORDER[filter.sort])
    .skip(Math.max(0, filter.skip))
    // La même borne que `REGISTRY_MAX_COUNT` : au-delà, le bouton « charger
    // plus » s'afficherait sans rien ajouter.
    .limit(Math.min(Math.max(filter.limit, 1), REGISTRY_MAX_COUNT));

  const docs = await (filter.query?.kind === "tag"
    ? cursor.collation({ locale: "en", strength: 2 })
    : cursor
  ).toArray();

  return docs.map(toRegistryUser);
}

export async function countPublicUsers(
  filter: Omit<RegistryUserFilter, "limit" | "skip" | "sort">,
): Promise<number> {
  const query = registryFilter({ ...filter, sort: "active", limit: 1, skip: 0 });
  if (!query) {
    return 0;
  }

  return db.collection(COLLECTION_NAME).countDocuments(query);
}

/**
 * Les comptes publics d'une même commune.
 *
 * `readRegistryUsersByIds` sert le cas d'à côté — une liste d'identifiants déjà
 * connue — mais ici c'est bien la ville qui désigne, et elle ne vaut que si le
 * compte l'a rendue visible.
 */
export async function readNearbyPublicUsers(input: {
  city: string;
  excludeUserId?: string;
  limit: number;
}): Promise<RegistryUser[]> {
  const filter: Record<string, unknown> = {
    isPublicProfile: true,
    "showcase.showCity": true,
    "location.city": input.city,
  };

  if (input.excludeUserId && ObjectId.isValid(input.excludeUserId)) {
    filter._id = { $ne: ObjectId.createFromHexString(input.excludeUserId) };
  }

  const docs = await db
    .collection(COLLECTION_NAME)
    .find(filter, { projection: REGISTRY_PROJECTION })
    .limit(Math.min(Math.max(input.limit, 1), 50))
    .toArray();

  return docs.map(toRegistryUser);
}

/** Des comptes désignés par leur identifiant, dans la forme du registre. */
export async function readRegistryUsersByIds(userIds: string[]): Promise<RegistryUser[]> {
  const validIds = userIds.filter(ObjectId.isValid).map(ObjectId.createFromHexString);
  if (validIds.length === 0) {
    return [];
  }

  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ _id: { $in: validIds } }, { projection: REGISTRY_PROJECTION })
    .toArray();

  return docs.map(toRegistryUser);
}

/**
 * Les identifiants des comptes au profil ouvert.
 *
 * Une projection sur le seul `_id` : c'est ce qui permet au classement des
 * succès de se restreindre aux profils publics sans que le module des succès
 * ait à connaître la confidentialité d'un compte.
 */
export async function readPublicUserIds(): Promise<Set<string>> {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ isPublicProfile: true }, { projection: { _id: 1 } })
    .toArray();

  return new Set(docs.map((doc) => doc._id.toString()));
}

/**
 * Enregistre la vitrine.
 *
 * L'écriture se fait **par sous-chemin** plutôt qu'en remplaçant `showcase`
 * d'un bloc : deux onglets ouverts sur le même compte, l'un qui range les blocs
 * et l'autre qui dépose une bannière, ne s'effacent plus l'un l'autre. C'est la
 * leçon d'`updatePlayGroupOptions`, que la personnalisation d'un lieu n'a pas
 * encore reprise.
 *
 * Une clef absente de l'objet n'est **pas** touchée ; une clef présente et
 * `undefined` est retirée. Le formulaire renvoyant toujours tous ses champs,
 * c'est ainsi qu'un champ vidé s'efface.
 */
export async function updateUserShowcase(
  userId: string,
  showcase: Partial<UserShowcase>,
): Promise<boolean> {
  if (!ObjectId.isValid(userId)) {
    return false;
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};

  for (const [key, value] of Object.entries(showcase)) {
    if (value === undefined) {
      unset[`showcase.${key}`] = "";
    } else {
      set[`showcase.${key}`] = value;
    }
  }

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return true;
  }

  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
  );

  return result.matchedCount > 0;
}
