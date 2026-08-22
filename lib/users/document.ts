import type { Document, WithId } from "mongodb";
import type { User, UserShowcase } from "@/lib/types/User";
import { USER_SHOWCASE_SECTION_KEYS, type UserShowcaseSectionKey } from "@/lib/users/showcase";

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
    // better-auth pose une `Date` ; la vitrine veut une chaîne comparable et
    // sérialisable jusqu'au composant client.
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : typeof doc.createdAt === "string"
          ? doc.createdAt
          : undefined,
    lairs: doc.lairs || [],
    games: doc.games || [],
    favoriteGames: doc.favoriteGames || [],
    friends: doc.friends || [],
    friendCode: doc.friendCode || undefined,
    isPublicProfile: doc.isPublicProfile || false,
    // Un compte sans préférence de prix suit l'ordre de la plateforme :
    // l'objet vide dit « rien de choisi » sans obliger chaque lecture à
    // distinguer l'absence de champ.
    pricePreference: {
      source: doc.pricePreference?.source || undefined,
      // Le repli n'est coupé que s'il a été coupé : un champ absent vaut
      // activé, comme pour tous les comptes créés avant le réglage.
      fallback: doc.pricePreference?.fallback !== false,
    },
    description: doc.description || undefined,
    website: doc.website || undefined,
    socialLinks: doc.socialLinks || [],
    profileImage: doc.profileImage || undefined,
    showcase: toShowcase(doc.showcase),
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

/**
 * La vitrine, relue champ par champ.
 *
 * Les clés de blocs inconnues sont écartées **ici** plutôt qu'au rendu : une
 * clé retirée du code reste en base, et la laisser traverser la conversion
 * ferait porter à chaque lecteur le soin de s'en méfier.
 */
function toShowcase(raw: unknown): UserShowcase | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const doc = raw as Record<string, unknown>;

  const sections = Array.isArray(doc.sections)
    ? doc.sections
        .filter(
          (section): section is { key: string; enabled: unknown } =>
            !!section &&
            typeof section === "object" &&
            typeof (section as { key?: unknown }).key === "string",
        )
        .filter((section) =>
          (USER_SHOWCASE_SECTION_KEYS as readonly string[]).includes(section.key),
        )
        .map((section) => ({
          key: section.key as UserShowcaseSectionKey,
          enabled: section.enabled !== false,
        }))
    : undefined;

  const links = Array.isArray(doc.links)
    ? doc.links
        .filter(
          (link): link is { url: string; label?: unknown } =>
            !!link &&
            typeof link === "object" &&
            typeof (link as { url?: unknown }).url === "string",
        )
        .map((link) => ({
          url: link.url,
          label: typeof link.label === "string" && link.label.length > 0 ? link.label : undefined,
        }))
    : undefined;

  return {
    banner: typeof doc.banner === "string" && doc.banner.length > 0 ? doc.banner : undefined,
    sections,
    pinnedDeckId:
      typeof doc.pinnedDeckId === "string" && doc.pinnedDeckId.length > 0
        ? doc.pinnedDeckId
        : undefined,
    links,
    showCity: doc.showCity === true,
    playStyles: Array.isArray(doc.playStyles)
      ? doc.playStyles.filter((style): style is string => typeof style === "string")
      : undefined,
  };
}
