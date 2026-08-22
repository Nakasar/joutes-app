import "server-only";

import { describeTargets, listAvailableTargets, type StreamTargetOption } from "@/lib/streams/announce";
import {
  streamPlatformListeningConfigured,
  streamPlatformOAuthConfigured,
} from "@/lib/streams/config";
import { ensureStreamLink, STREAM_PROVIDER_IDS } from "@/lib/streams/identity";
import { targetKey } from "@/lib/streams/targets";
import { STREAM_PLATFORMS, type StreamLink, type StreamPlatform } from "@/lib/types/StreamLink";

/**
 * Ce que l'écran « Connexions et comptes » a besoin de savoir, par plateforme.
 *
 * Rassemblé ici plutôt que dans la page : cela demande de croiser trois sources
 * — les comptes sociaux de Better Auth, la liaison de chaîne, et les lieux et
 * groupes où la personne peut annoncer — et la page ne devrait avoir qu'à
 * disposer le résultat.
 *
 * Les destinations disponibles sont calculées **une fois** et partagées par les
 * deux cartes : ce sont les mêmes lieux et les mêmes groupes, et les relire
 * doublerait les requêtes pour rien.
 */

export type StreamAccountView = {
  platform: StreamPlatform;
  linked: boolean;
  oauthConfigured: boolean;
  listeningConfigured: boolean;
  channelName?: string;
  channelUrl?: string;
  subscriptionState: StreamLink["subscription"]["state"];
  targets: StreamTargetOption[];
  available: StreamTargetOption[];
  live?: { url: string; title?: string; startedAt: string } | null;
};

export type LinkedAccount = { providerId: string; accountId: string };

export async function readStreamAccountViews(
  userId: string,
  accounts: LinkedAccount[],
): Promise<StreamAccountView[]> {
  const everything = await listAvailableTargets(userId);

  return Promise.all(
    STREAM_PLATFORMS.map(async (platform) => {
      const account = accounts.find((item) => item.providerId === STREAM_PROVIDER_IDS[platform]);

      const base = {
        platform,
        linked: Boolean(account),
        oauthConfigured: streamPlatformOAuthConfigured(platform),
        listeningConfigured: streamPlatformListeningConfigured(platform),
        subscriptionState: "idle" as const,
        targets: [],
        available: [] as StreamAccountView["available"],
        live: null,
      } satisfies StreamAccountView;

      if (!account) {
        return base;
      }

      const link = await ensureStreamLink({ userId, platform, accountId: account.accountId });

      if (!link) {
        // Compte lié mais chaîne jamais résolue — plateforme non configurée,
        // jeton expiré, compte Google sans chaîne. La carte le dit et propose de
        // délier ; elle ne propose pas de destinations, qui n'auraient rien à
        // écouter.
        //
        // Le cas où la liaison **existe** mais dont l'identité n'a pas pu être
        // rafraîchie ne passe pas par ici : `ensureStreamLink` rend alors la
        // liaison telle qu'elle est. C'est délibéré — une lecture d'identité en
        // échec ne doit pas faire disparaître de l'écran les destinations que
        // son propriétaire y a mises.
        return base;
      }

      const chosen = new Set(link.targets.map(targetKey));

      return {
        ...base,
        channelName: link.channelName,
        channelUrl: link.channelUrl,
        subscriptionState: link.subscription.state,
        targets: await describeTargets(link.targets),
        available: everything.filter(({ target }) => !chosen.has(targetKey(target))),
        live: link.live
          ? { url: link.live.url, title: link.live.title, startedAt: link.live.startedAt }
          : null,
      };
    }),
  );
}
