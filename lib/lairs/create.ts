import {
  countPublicLairsCreatedBy,
  createLair as insertLair,
  findPublicLairsByName,
} from "@/lib/db/lairs";
import { addLairToUser } from "@/lib/db/users";
import type { Lair } from "@/lib/types/Lair";
import { generateInvitationCode } from "@/lib/utils/invitation-codes";
import {
  MAX_PUBLIC_LAIRS_PER_OWNER,
  findDuplicateLair,
  toLairLocation,
  validateLairCreation,
  type LairCreationIssue,
} from "./creation";

/**
 * L'ouverture d'un lieu par un joueur — publique ou privée.
 *
 * Le cœur vit ici plutôt que dans l'action serveur pour une raison mécanique :
 * un module `"use server"` ne peut exporter que des fonctions asynchrones
 * appelables depuis le navigateur, ce qui interdit d'y poser des constantes ou
 * des types partagés. Les deux écrans qui créent un lieu — l'annuaire et
 * l'ancien gestionnaire du compte — passent donc tous les deux par cette
 * fonction, et la règle du plafond comme celle du doublon ne sont écrites
 * qu'une fois.
 *
 * Ce que la création **n'ouvre pas** : ni bannière, ni jeux, ni sources
 * d'événements. Ces champs se remplissent depuis l'écran de gestion du lieu,
 * une fois qu'on en est propriétaire ; les accepter ici reviendrait à les
 * rendre écrivables par la seule requête de création, avant tout contrôle.
 */

/**
 * Les refus de la création, en codes — l'écran les traduit.
 *
 * Les griefs de validation viennent tels quels de `validateLairCreation`, qui
 * distingue un champ absent d'un champ fautif ; s'y ajoutent les deux refus que
 * seule la base peut prononcer, et la panne.
 */
export type CreateLairError = LairCreationIssue | "TOO_MANY" | "FAILED";

export type CreateLairResult =
  | { success: true; lair: Lair }
  | { success: false; error: CreateLairError }
  /**
   * Le doublon rend le lieu qu'il a reconnu : l'écran peut alors proposer d'y
   * aller, ce qui est la seule chose utile à faire quand la boutique qu'on
   * s'apprêtait à saisir est déjà là.
   */
  | { success: false; error: "DUPLICATE"; duplicate: { id: string; name: string } };

export type CreateLairInput = {
  name: string;
  visibility: "public" | "private";
  address?: string;
  website?: string;
  location?: { latitude: number; longitude: number };
};

export async function createLairForUser(
  userId: string,
  input: CreateLairInput
): Promise<CreateLairResult> {
  const parsed = validateLairCreation(input);

  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  const data = parsed.data;
  const isPrivate = data.visibility === "private";
  const location = toLairLocation(data.location);

  try {
    if (!isPrivate) {
      // Les deux gardes ne valent que pour l'annuaire : un lieu privé ne paraît
      // nulle part, ne concurrence aucune fiche et n'a donc ni plafond ni
      // doublon à craindre.
      const created = await countPublicLairsCreatedBy(userId);
      if (created >= MAX_PUBLIC_LAIRS_PER_OWNER) {
        return { success: false, error: "TOO_MANY" };
      }

      const duplicate = findDuplicateLair(await findPublicLairsByName(data.name), {
        name: data.name,
        location,
      });

      if (duplicate) {
        return {
          success: false,
          error: "DUPLICATE",
          duplicate: { id: duplicate.id, name: duplicate.name },
        };
      }
    }

    const lair = await insertLair({
      name: data.name,
      address: data.address || undefined,
      website: data.website || undefined,
      location,
      isPrivate,
      // Le code d'invitation est la seule porte d'entrée d'un lieu privé ; un
      // lieu public n'en porte pas, faute de quoi il aurait un accès parallèle
      // à ce que tout le monde voit déjà.
      invitationCode: isPrivate ? generateInvitationCode() : undefined,
      games: [],
      eventsSourceUrls: [],
      owners: [userId],
      // Qui a ouvert la fiche, et non pas seulement qui la gère aujourd'hui :
      // c'est sur cette trace que porte le plafond, de sorte que recevoir la
      // gestion d'un lieu existant n'entame pas le droit d'en ouvrir un.
      createdBy: userId,
    });

    // Le créateur suit son propre lieu : c'est ce qui fait remonter ses
    // événements dans son calendrier sans qu'il ait à s'y abonner lui-même.
    await addLairToUser(userId, lair.id);

    return { success: true, lair };
  } catch (error) {
    console.error("Création du lieu impossible:", error);
    return { success: false, error: "FAILED" };
  }
}
