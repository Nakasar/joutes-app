import "server-only";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";

import { locales } from "@/i18n/config";
import * as lairsDb from "@/lib/db/lairs";
import * as playGroupsDb from "@/lib/db/play-groups";
import { setStreamLinkLive } from "@/lib/db/stream-links";
import type { StreamAnnouncement, StreamLink, StreamLinkLive, StreamTarget } from "@/lib/types/StreamLink";

/**
 * Poser et retirer un direct sur ses destinations.
 *
 * Le cœur de la fonctionnalité, et le seul endroit qui écrit dans les lieux et
 * les groupes au nom d'une plateforme. Trois règles le gouvernent.
 *
 * **Le droit se vérifie à l'annonce, pas seulement à l'ajout.** Entre le moment
 * où quelqu'un désigne un lieu et celui où il démarre son direct, il a pu en
 * perdre la propriété ou quitter le groupe. Une destination devenue interdite
 * est sautée en silence — ce n'est pas une erreur de la plateforme, c'est une
 * situation qui a changé.
 *
 * **On ne défait que ce qu'on a fait.** La fin d'un direct relit les annonces
 * réellement écrites (`live.announcements`) plutôt que les destinations du
 * moment, et ne retire un direct de lieu que si son URL est encore la nôtre :
 * un gérant qui a collé un autre lien à la main entre-temps garde le sien.
 *
 * **Un lieu n'affiche qu'un direct, un groupe jusqu'à trois.** Le premier
 * remplace, le second empile — un membre n'y ayant droit qu'à une ligne, que
 * `setPlayGroupLiveStream` remplace déjà de son côté.
 */

function revalidateTarget(target: StreamTarget) {
  // On arrive presque toujours sur un profil par son pseudonyme, pas par son
  // identifiant : c'est le motif de route qu'il faut invalider, comme le fait
  // déjà l'administration des comptes. Les deux formes sont ainsi couvertes.
  if (target.kind === "user") {
    revalidatePath("/users/[userTagOrId]", "page");
    return;
  }

  const path = target.kind === "lair" ? `lairs/${target.id}` : `play-groups/${target.id}`;

  for (const locale of locales) {
    revalidatePath(`/${locale}/${path}`, "layout");
  }
}

/**
 * Le lecteur a-t-il le droit d'annoncer sur cette destination ?
 *
 * Ferme par défaut, y compris sur l'erreur : un identifiant de lieu qui n'est
 * pas un ObjectId fait jeter le pilote Mongo, et cette question-là est posée en
 * plein milieu de l'annonce d'un direct — une exception y emporterait les autres
 * destinations.
 */
export async function canAnnounceOn(userId: string, target: StreamTarget): Promise<boolean> {
  try {
    // Son propre profil, et celui-là seulement : sans cette égalité, la
    // destination « profil » annoncerait un direct sur la vitrine de n'importe
    // qui.
    if (target.kind === "user") {
      return target.id === userId;
    }

    if (target.kind === "lair") {
      if (!ObjectId.isValid(target.id)) {
        return false;
      }

      const lair = await lairsDb.getLairById(target.id);
      return Boolean(lair?.owners?.includes(userId));
    }

    const group = await playGroupsDb.getPlayGroupByIdAndUser(target.id, userId);
    return group !== null;
  } catch (error) {
    console.error(`Vérification de droit impossible sur ${target.kind}:${target.id}`, error);
    return false;
  }
}

export type StreamTargetOption = {
  target: StreamTarget;
  label: string;
};

/**
 * Les destinations possibles pour ce compte : ses lieux, ses groupes.
 *
 * Une seule liste, triée par nom : l'écran de compte n'a pas à savoir qu'un lieu
 * et un groupe se lisent dans deux collections.
 */
export async function listAvailableTargets(userId: string): Promise<StreamTargetOption[]> {
  const [lairs, groups] = await Promise.all([
    lairsDb.getLairsOwnedByUser(userId),
    playGroupsDb.getPlayGroupsForUser(userId),
  ]);

  const owned: StreamTargetOption[] = [
    ...lairs.map((lair) => ({ target: { kind: "lair" as const, id: lair.id }, label: lair.name })),
    ...groups.map((group) => ({ target: { kind: "play-group" as const, id: group.id }, label: group.name })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  // Son profil en tête, et hors du tri : c'est la destination que tout le monde
  // possède, et celle qu'on vient chercher. Son libellé est traduit à
  // l'affichage — cette liste ne connaît pas la langue de la page.
  return [{ target: { kind: "user" as const, id: userId }, label: USER_TARGET_LABEL }, ...owned];
}

/**
 * Le libellé de repli de la destination « mon profil ».
 *
 * Les autres destinations portent un nom qui leur appartient — celui du lieu,
 * celui du groupe. Un profil n'en a pas : il *est* celui qui regarde. L'écran
 * remplace donc cette chaîne par sa traduction, et elle ne sert qu'aux appelants
 * qui n'ont pas de traducteur sous la main.
 */
export const USER_TARGET_LABEL = "Mon profil";

/**
 * Le nom de chaque destination enregistrée.
 *
 * Rend une entrée même pour ce qui n'existe plus : l'écran doit pouvoir montrer
 * la ligne pour qu'on la retire, plutôt que de la faire disparaître en laissant
 * une destination fantôme dans la base.
 */
export async function describeTargets(targets: StreamTarget[]): Promise<StreamTargetOption[]> {
  // `getLairsByIds` construit des `ObjectId` sans filet : un identifiant
  // malformé y jetterait, et l'écran de compte entier tomberait pour une seule
  // ligne devenue illisible.
  const lairIds = targets
    .filter((target) => target.kind === "lair" && ObjectId.isValid(target.id))
    .map((target) => target.id);
  const groupIds = targets.filter((target) => target.kind === "play-group").map((target) => target.id);

  const [lairs, groups] = await Promise.all([
    lairIds.length > 0 ? lairsDb.getLairsByIds(lairIds) : Promise.resolve([]),
    Promise.all(groupIds.map((id) => playGroupsDb.getPlayGroupById(id))),
  ]);

  const names = new Map<string, string>();
  for (const lair of lairs) {
    names.set(`lair:${lair.id}`, lair.name);
  }
  for (const group of groups) {
    if (group) {
      names.set(`play-group:${group.id}`, group.name);
    }
  }

  return targets.map((target) => ({
    target,
    label:
      target.kind === "user"
        ? USER_TARGET_LABEL
        : (names.get(`${target.kind}:${target.id}`) ?? "Destination supprimée"),
  }));
}

export type LiveInput = {
  url: string;
  title?: string;
  /** ISO 8601 donné par la plateforme quand elle le donne ; sinon, maintenant. */
  startedAt?: string;
  platformStreamId?: string;
};

async function writeToLair(
  lairId: string,
  live: LiveInput,
  startedAt: string,
): Promise<StreamAnnouncement | null> {
  const lair = await lairsDb.getLairById(lairId);
  if (!lair) {
    return null;
  }

  await lairsDb.updateLair(lairId, {
    options: {
      ...lair.options,
      live: { url: live.url, title: live.title, startedAt },
    },
  });

  return { target: { kind: "lair", id: lairId } };
}

async function writeToPlayGroup(
  playGroupId: string,
  userId: string,
  live: LiveInput,
  startedAt: string,
): Promise<StreamAnnouncement | null> {
  const liveId = new ObjectId().toString();

  const updated = await playGroupsDb.setPlayGroupLiveStream(playGroupId, {
    id: liveId,
    url: live.url,
    title: live.title,
    memberId: userId,
    startedAt,
  });

  if (!updated) {
    // Groupe introuvable, ou trois directs déjà affichés : la vitrine est pleine
    // et ce n'est pas à nous de décider lequel évincer.
    return null;
  }

  // `setPlayGroupLiveStream` conserve l'identifiant du direct déjà posé par ce
  // membre : c'est celui-là qu'il faudra retirer, pas celui qu'on vient de tirer.
  const stored = updated.options?.lives?.find((item) => item.memberId === userId);

  return { target: { kind: "play-group", id: playGroupId }, liveId: stored?.id ?? liveId };
}

/**
 * Annoncer sur son propre profil ne demande aucune écriture.
 *
 * La vitrine lit `stream_links.live` directement — c'est le document qu'on est
 * en train de mettre à jour. L'annonce est tout de même **enregistrée** : le
 * retrait se fait sur ce qui a été écrit, et une destination qui n'apparaîtrait
 * pas là rendrait la fin du direct asymétrique.
 */
function writeToUser(userId: string): StreamAnnouncement {
  return { target: { kind: "user", id: userId } };
}

/**
 * Annonce le direct sur toutes les destinations autorisées.
 *
 * Rend la liaison mise à jour. Si aucune destination n'a pu être écrite, la
 * liaison reste sans direct : annoncer « en direct » quelque part où rien n'a
 * été posé rendrait la fin du direct impossible à interpréter.
 */
export async function announceLive(link: StreamLink, live: LiveInput): Promise<StreamLink | null> {
  const startedAt = live.startedAt ?? new Date().toISOString();
  const announcements: StreamAnnouncement[] = [];

  for (const target of link.targets) {
    if (!(await canAnnounceOn(link.userId, target))) {
      continue;
    }

    try {
      const announcement =
        target.kind === "user"
          ? writeToUser(link.userId)
          : target.kind === "lair"
            ? await writeToLair(target.id, live, startedAt)
            : await writeToPlayGroup(target.id, link.userId, live, startedAt);

      if (announcement) {
        announcements.push(announcement);
        revalidateTarget(target);
      }
    } catch (error) {
      // Une destination en échec ne doit pas emporter les autres : le direct est
      // déjà commencé, et l'annoncer partout ailleurs vaut mieux que nulle part.
      console.error(`Annonce de direct impossible sur ${target.kind}:${target.id}`, error);
    }
  }

  if (announcements.length === 0) {
    return null;
  }

  const value: StreamLinkLive = {
    url: live.url,
    title: live.title,
    startedAt,
    platformStreamId: live.platformStreamId,
    announcements,
  };

  return setStreamLinkLive(link.id, value);
}

/**
 * Retire le direct des destinations où il a été posé.
 *
 * Sans effet si la liaison n'annonce rien — la fin d'un direct jamais annoncé
 * (parce que personne n'avait de destination) arrive à chaque `stream.offline`,
 * et n'est pas une anomalie.
 */
export async function retractLive(link: StreamLink): Promise<StreamLink | null> {
  const live = link.live;

  if (!live) {
    return link;
  }

  for (const announcement of live.announcements) {
    try {
      if (announcement.target.kind === "user") {
        // Rien à défaire : `setStreamLinkLive(link.id, null)`, plus bas, est
        // l'effacement lui-même.
      } else if (announcement.target.kind === "lair") {
        const lair = await lairsDb.getLairById(announcement.target.id);

        // Un autre direct a pris la place depuis : il n'est pas à nous.
        if (!lair || lair.options?.live?.url !== live.url) {
          continue;
        }

        await lairsDb.updateLair(announcement.target.id, {
          options: { ...lair.options, live: null },
        });
      } else if (announcement.liveId) {
        await playGroupsDb.removePlayGroupLiveStream(announcement.target.id, announcement.liveId);
      }

      revalidateTarget(announcement.target);
    } catch (error) {
      console.error(
        `Retrait de direct impossible sur ${announcement.target.kind}:${announcement.target.id}`,
        error,
      );
    }
  }

  return setStreamLinkLive(link.id, null);
}
