import type { Document, WithId } from "mongodb";
import type { User } from "@/lib/types/User";

/**
 * Un document de la collection `user`, rendu sous la forme attendue par
 * l'application.
 *
 * La conversion est **explicite, champ par champ** : le document porte aussi ce
 * que better-auth y écrit, et rien de tout cela n'a à ressortir. Le revers est
 * qu'un champ ajouté au type sans l'être ici est écrit en base et jamais relu —
 * c'est exactement ce qui est arrivé aux jeux favoris, enregistrés puis perdus
 * à chaque lecture. D'où ce module à part, testé : ajouter un champ au type
 * `User` sans le convertir casse maintenant un test.
 *
 * Séparé de `lib/db/users.ts`, qui ouvre une connexion MongoDB au chargement et
 * ne peut donc pas être importé par un test.
 */
export function toUser(doc: WithId<Document>): User {
  return {
    id: doc.id || doc._id.toString(),
    username: doc.name || doc.username || "",
    displayName: doc.displayName || undefined,
    discriminator: doc.discriminator || undefined,
    email: doc.email,
    discordId: doc.discordId || "",
    avatar: doc.image || doc.avatar || "",
    lairs: doc.lairs || [],
    games: doc.games || [],
    favoriteGames: doc.favoriteGames || [],
    friends: doc.friends || [],
    friendCode: doc.friendCode || undefined,
    isPublicProfile: doc.isPublicProfile || false,
    description: doc.description || undefined,
    website: doc.website || undefined,
    socialLinks: doc.socialLinks || [],
    profileImage: doc.profileImage || undefined,
    location: doc.location
      ? {
          latitude: doc.location.latitude,
          longitude: doc.location.longitude,
          label: doc.location.label || undefined,
          city: doc.location.city || undefined,
          postalCode: doc.location.postalCode || undefined,
        }
      : undefined,
  };
}
