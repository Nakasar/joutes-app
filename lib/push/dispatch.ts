import 'server-only';

import { after } from "next/server";
import type { Notification, NotificationTarget } from "@/lib/types/Notification";
import { describeAudience } from "@/lib/notifications/audience";
import { notificationLink } from "@/lib/notifications/deeplink";
import { loadAudienceUserIds } from "@/lib/db/notifications-audience";
import {
  countActiveDevicesForUsers,
  listActiveDevicesForUsers,
} from "@/lib/db/push-devices";
import {
  MAX_PUSH_JOB_ATTEMPTS,
  claimPushJob,
  enqueuePushJob,
  failPushJob,
  finishPushJob,
  releasePushJob,
  suspendPushJob,
} from "@/lib/db/push-jobs";
import { isPushEnabled } from "@/lib/push/config";
import { sendToDevices } from "@/lib/push/send";
import type { PushContent } from "@/lib/push/payload";

/**
 * D'une notification à des téléphones qui sonnent.
 *
 * Le compromis central est ici. La quasi-totalité des notifications Joutes
 * touchent une poignée de destinataires — un appariement, une demande d'ami, un
 * match de ligue — et ce sont précisément celles qui doivent arriver tout de
 * suite. Les faire passer par une file pour se prémunir contre les annonces
 * d'un lair très suivi ajouterait une minute d'attente à tout le monde, pour
 * borner un cas qui se compte en quelques documents par semaine.
 *
 * D'où un seuil : en dessous, on envoie dans la foulée, après la réponse HTTP ;
 * au-dessus, on met en file et le cron dépile par pages.
 */

/**
 * Au-delà de ce nombre d'appareils, on passe par la file. Le chiffre vise la
 * durée d'une invocation, pas une limite des fournisseurs : deux cents envois
 * multiplexés tiennent en une paire de secondes.
 */
export const INLINE_FANOUT_LIMIT = 200;

/** Ce que le cron traite par exécution. */
export const PUSH_JOB_PAGE_SIZE = 500;

/** Combien de travaux le cron réclame par passage. */
const JOBS_PER_RUN = 5;

/**
 * Le contenu du push, tiré de la notification.
 *
 * Le regroupement mérite un mot : deux rappels pour la même ronde doivent se
 * remplacer sur l'écran de verrouillage, pas s'y empiler. La notification ne
 * porte pas de clé de regroupement, mais le couple modèle + match en tient
 * lieu — c'est exactement ce qui se répète.
 */
export function pushContentFor(notification: Notification): PushContent {
  return {
    title: notification.title,
    body: notification.description,
    link: notificationLink(notification),
    notificationId: notification.id,
    ...(notification.template && notification.matchId
      ? { collapseId: `${notification.template}:${notification.matchId}` }
      : {}),
  };
}

/** La cible d'une notification, telle que l'union discriminée l'exprime. */
function targetOf(notification: Notification): NotificationTarget {
  return notification as unknown as NotificationTarget;
}

/**
 * Résout l'audience, puis envoie ou met en file selon sa taille.
 *
 * N'est jamais appelée directement par le code métier : elle passe par
 * `schedulePushFanout`, qui garantit qu'aucune erreur d'ici ne remonte.
 */
export async function runPushFanout(notification: Notification): Promise<void> {
  const source = describeAudience(targetOf(notification));
  const userIds = await loadAudienceUserIds(source);
  if (userIds.length === 0) return;

  const devices = await countActiveDevicesForUsers(userIds);
  if (devices === 0) return;

  if (devices > INLINE_FANOUT_LIMIT) {
    await enqueuePushJob(notification.id);
    return;
  }

  await sendToDevices(
    await listActiveDevicesForUsers(userIds, { limit: INLINE_FANOUT_LIMIT }),
    pushContentFor(notification)
  );
}

/**
 * Planifie le fan-out. **Synchrone, sans retour, et ne lève jamais.**
 *
 * C'est le contrat qui compte : une notification enregistrée sans push vaut
 * infiniment mieux qu'une demande d'ami annulée parce qu'Apple était
 * indisponible. Tout ce qui peut mal tourner est attrapé.
 *
 * `after()` lève hors d'un contexte de requête — un script d'administration,
 * un test. On retombe alors sur la file : le push est retardé jusqu'au prochain
 * passage du cron, jamais perdu.
 */
export function schedulePushFanout(notification: Notification): void {
  if (!isPushEnabled()) return;

  try {
    after(async () => {
      try {
        await runPushFanout(notification);
      } catch (error) {
        console.error("[push] fan-out échoué", notification.id, error);
      }
    });
  } catch {
    void enqueuePushJob(notification.id).catch((error) => {
      console.error("[push] mise en file impossible", notification.id, error);
    });
  }
}

/**
 * Dépile un travail, page par page.
 *
 * La pagination se fait sur l'identifiant du dernier appareil traité, pas sur
 * un `skip` : au bout de quelques dizaines de milliers de lignes, un `skip`
 * coûte le balayage qu'il prétend éviter.
 */
async function drainOne(
  jobId: string,
  notification: Notification,
  cursor: string | null
): Promise<void> {
  const source = describeAudience(targetOf(notification));
  const userIds = await loadAudienceUserIds(source);

  if (userIds.length === 0) {
    await finishPushJob(jobId, 0);
    return;
  }

  const devices = await listActiveDevicesForUsers(userIds, {
    limit: PUSH_JOB_PAGE_SIZE,
    ...(cursor ? { after: cursor } : {}),
  });

  if (devices.length === 0) {
    await finishPushJob(jobId, 0);
    return;
  }

  const summary = await sendToDevices(devices, pushContentFor(notification));

  if (devices.length < PUSH_JOB_PAGE_SIZE) {
    await finishPushJob(jobId, summary.delivered);
    return;
  }

  await suspendPushJob(jobId, devices[devices.length - 1].id, summary.delivered);
}

/**
 * Le passage du cron. Réclame quelques travaux et les fait avancer d'une page
 * chacun, plutôt que d'en vider un seul : une annonce massive ne doit pas
 * retarder indéfiniment celles qui suivent.
 */
export async function drainPushJobs(
  getNotification: (id: string) => Promise<Notification | null>
): Promise<{ processed: number; failed: number }> {
  if (!isPushEnabled()) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (let index = 0; index < JOBS_PER_RUN; index++) {
    const job = await claimPushJob();
    if (!job) break;

    if (job.attempts > MAX_PUSH_JOB_ATTEMPTS) {
      await failPushJob(job.id, `Abandon après ${job.attempts} tentatives`);
      failed++;
      continue;
    }

    try {
      const notification = await getNotification(job.notificationId);
      if (!notification) {
        // La notification a été supprimée entre-temps : le travail n'a plus
        // d'objet, ce n'est pas un échec.
        await finishPushJob(job.id, 0);
        continue;
      }

      await drainOne(job.id, notification, job.cursor);
      processed++;
    } catch (error) {
      await releasePushJob(job.id, (error as Error).message);
      failed++;
    }
  }

  return { processed, failed };
}
