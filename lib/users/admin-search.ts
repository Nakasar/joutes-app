/**
 * Recherche d'utilisateurs pour l'administration.
 *
 * Une seule barre de saisie, trois façons de désigner quelqu'un : son
 * identifiant (recopié depuis un signalement ou un journal), son tag complet
 * `Pseudo#1234`, ou un fragment de pseudonyme. L'administrateur ne devrait pas
 * avoir à choisir laquelle avant de taper.
 *
 * **L'adresse e-mail n'en fait pas partie, et ce n'est pas un oubli.** C'est une
 * donnée personnelle : elle ne s'affiche pas, et ne sert pas non plus à
 * chercher — une recherche par e-mail confirmerait qu'une adresse donnée
 * appartient à un compte, ce qui revient à l'exposer.
 *
 * Module pur, sans accès à la base : `lib/db/users.ts` ouvre une connexion
 * MongoDB au chargement et ne peut donc pas être importé par un test, alors que
 * l'interprétation de la saisie est exactement ce qui mérite d'en avoir un.
 */

/** Ce que l'administrateur a désigné, une fois sa saisie interprétée. */
export type AdminUserQuery =
  // Identifiant recopié tel quel (24 caractères hexadécimaux).
  | { kind: "id"; id: string }
  // Tag complet : le pseudonyme et son nombre à quatre chiffres.
  | { kind: "tag"; displayName: string; discriminator: string }
  // Fragment de pseudonyme, déjà échappé pour servir d'expression régulière.
  | { kind: "text"; pattern: string };

/**
 * Un pseudonyme peut contenir n'importe quoi, y compris ce qui a un sens dans
 * une expression régulière. Sans échappement, chercher « (test » ferait échouer
 * la requête, et « .* » balaierait toute la collection.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Interprète la saisie. Rend `null` quand il n'y a rien à chercher : une
 * recherche vide ne doit pas lister toute la base, ni par accident ni par
 * curiosité.
 */
export function parseAdminUserSearch(term: string): AdminUserQuery | null {
  // Le « @ » de tête est celui qu'on recopie d'une mention ; il ne fait pas
  // partie du pseudonyme.
  const trimmed = term.trim().replace(/^@/, "").trim();
  if (trimmed.length === 0) return null;

  if (/^[0-9a-f]{24}$/i.test(trimmed)) {
    return { kind: "id", id: trimmed.toLowerCase() };
  }

  // Le dernier « # » sépare le tag : un pseudonyme peut en contenir.
  const separator = trimmed.lastIndexOf("#");
  if (separator > 0) {
    const displayName = trimmed.slice(0, separator).trim();
    const discriminator = trimmed.slice(separator + 1).trim();
    if (displayName.length > 0) {
      // Un discriminateur est un nombre. La longueur n'est pas imposée : la
      // plateforme en génère quatre chiffres, un compte importé peut en porter
      // moins, et refuser son tag ne rendrait service à personne.
      if (/^\d+$/.test(discriminator)) {
        return { kind: "tag", displayName, discriminator };
      }
      // « Alice# » ou « Alice#abc » ne désignent aucun tag. Chercher la saisie
      // entière ne trouverait rien non plus — aucun pseudonyme ne contient ce
      // qu'on vient de taper. C'est le pseudonyme de gauche qu'on cherche.
      return { kind: "text", pattern: escapeRegex(displayName) };
    }
  }

  return { kind: "text", pattern: escapeRegex(trimmed) };
}

/**
 * Utilisateur tel que l'administration le voit dans les résultats.
 *
 * Volontairement étroit : le document porte l'e-mail, l'identifiant Discord et
 * tout ce que better-auth y écrit. Rien de tout cela n'a à traverser la
 * frontière du serveur pour afficher une liste de pseudonymes — la lecture le
 * laisse donc en base plutôt que de compter sur l'affichage pour l'omettre.
 */
export type AdminUserSummary = {
  id: string;
  // Nom de compte, repli quand personne n'a choisi de pseudonyme personnalisé.
  // Peut être vide : un compte importé n'en porte pas toujours, et l'affichage
  // retombe alors sur l'identifiant plutôt que sur une case blanche.
  username: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
  // Le profil est-il ouvert aux autres joueurs ? Utile avant de cliquer : un
  // profil privé ne montrera ni jeux suivis ni succès.
  isPublicProfile: boolean;
};

/**
 * Tag affiché : le pseudonyme personnalisé et son nombre quand il existe, le
 * nom de compte sinon. Même règle que la fiche de profil.
 *
 * Dernier recours, l'identifiant : un compte sans aucun nom laisserait sinon
 * une ligne vide, impossible à distinguer d'une autre et sans initiale pour son
 * avatar. Mieux vaut une étiquette technique qu'aucune étiquette.
 */
export function adminUserTag(user: AdminUserSummary): string {
  if (user.displayName && user.discriminator) {
    return `${user.displayName}#${user.discriminator}`;
  }
  return user.username || user.id;
}
