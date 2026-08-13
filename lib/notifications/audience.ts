import type { NotificationTarget } from "@/lib/types/Notification";

/**
 * Destinataires réels d'une notification.
 *
 * Une notification Joutes n'est pas adressée à quelqu'un : elle **cible une
 * audience**, et cette audience n'est résolue qu'à la lecture, par le `$match`
 * d'autorisation de `getUserNotifications` (`lib/db/notifications.ts`). Le site
 * n'a jamais eu besoin d'autre chose — chaque visiteur demande ce qui le
 * concerne, et le pipeline répond.
 *
 * Un envoi sortant pose la question dans l'autre sens : *à qui* faut-il écrire ?
 * C'est l'inverse de ce `$match`, et il n'existait nulle part. Ce module l'écrit,
 * en deux temps pour rester testable :
 *
 *  - `describeAudience` dit **ce qu'il faut aller chercher** en base ;
 *  - `resolveAudience` **combine** ce qui a été chargé.
 *
 * Module pur, sans accès à la base : `lib/mongodb.ts` ouvre une connexion à
 * l'import, et la correspondance avec le `$match` est justement ce qui mérite
 * un test. Les lectures vivent dans `lib/db/notifications-audience.ts`.
 */

/** Ce qu'il faut charger pour connaître les destinataires d'une notification. */
export type AudienceSource =
  | { kind: "user"; userId: string }
  | { kind: "lair"; lairId: string; owners: boolean; followers: boolean }
  | { kind: "event"; eventId: string; participants: boolean; creator: boolean };

/** Les listes chargées en base, telles que le module pur les attend. */
export type LoadedAudience = {
  /** `lair.owners` — des identifiants d'utilisateurs. */
  owners?: string[];
  /** Les utilisateurs dont `user.lairs` contient le lair. */
  followers?: string[];
  /** `event.participants`. */
  participants?: string[];
  /** `event.creatorId`. */
  creatorId?: string | null;
};

/**
 * Traduit la cible d'une notification en besoins de chargement.
 *
 * `target: 'all'` demande **les deux** listes, pas l'une ou l'autre : c'est ce
 * que dit le `$match`, où `'all'` figure dans les deux branches d'un `$or`.
 * L'écrire autrement priverait de push la moitié des destinataires d'une
 * annonce, sans que rien ne le signale.
 */
export function describeAudience(target: NotificationTarget): AudienceSource {
  switch (target.type) {
    case "user":
      return { kind: "user", userId: target.userId };
    case "lair":
      return {
        kind: "lair",
        lairId: target.lairId,
        owners: target.target === "owners" || target.target === "all",
        followers: target.target === "followers" || target.target === "all",
      };
    case "event":
      return {
        kind: "event",
        eventId: target.eventId,
        participants: target.target === "participants" || target.target === "all",
        creator: target.target === "creator" || target.target === "all",
      };
  }
}

/**
 * Destinataires d'une notification, dédupliqués et dans l'ordre où ils
 * apparaissent. Un propriétaire qui suit aussi son lair, ou un créateur inscrit
 * à son propre événement, ne doit pas recevoir deux téléphones qui sonnent pour
 * un seul message.
 *
 * `exclude` sert à ne pas se notifier soi-même. Personne ne le passe encore :
 * la notification ne porte pas qui l'a déclenchée. Le paramètre existe pour que
 * le jour où elle le portera, il n'y ait rien à retoucher ici.
 */
export function resolveAudience(
  source: AudienceSource,
  loaded: LoadedAudience = {},
  options: { exclude?: string[] } = {}
): string[] {
  const excluded = new Set(options.exclude ?? []);
  const seen = new Set<string>();
  const recipients: string[] = [];

  const push = (userId: string | null | undefined) => {
    if (!userId) return;
    if (excluded.has(userId) || seen.has(userId)) return;
    seen.add(userId);
    recipients.push(userId);
  };

  switch (source.kind) {
    case "user":
      push(source.userId);
      break;
    case "lair":
      if (source.owners) (loaded.owners ?? []).forEach(push);
      if (source.followers) (loaded.followers ?? []).forEach(push);
      break;
    case "event":
      if (source.participants) (loaded.participants ?? []).forEach(push);
      if (source.creator) push(loaded.creatorId);
      break;
  }

  return recipients;
}
