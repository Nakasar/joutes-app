/**
 * Un direct : reconnaître la plateforme, et en tirer une URL de lecteur
 * intégrable.
 *
 * Partagé par les lieux et les groupes de jeu — les deux acceptent les mêmes
 * plateformes et affichent le même lecteur, et une seconde copie de cette
 * reconnaissance d'URL divergerait au premier correctif.
 *
 * Twitch exige que le domaine de la page qui intègre son lecteur soit annoncé
 * dans le paramètre `parent`, faute de quoi il refuse de démarrer. C'est
 * pourquoi ces fonctions demandent l'hôte : il ne peut pas être deviné à
 * l'écriture, il dépend du déploiement.
 */

export type LivePlatform = "twitch" | "youtube";

export type LiveEmbed = {
  platform: LivePlatform;
  /** L'URL à donner à l'`iframe`. */
  embedUrl: string;
  /** L'URL publique, pour la légende et le repli en lien. */
  channelUrl: string;
  /** « twitch.tv/antretemps » — la légende sous le lecteur. */
  label: string;
  /**
   * L'image du direct, servie par la plateforme.
   *
   * Twitch et YouTube exposent tous deux une vignette publique à URL stable :
   * elle évite d'intégrer un lecteur par groupe sur une page de liste, où une
   * dizaine d'`iframe` qui démarrent en même temps coûteraient plus cher que
   * toute la page. Les deux hôtes ne sont pas déclarés dans `next.config.ts` :
   * cette URL se pose sur une balise `img` nue, pas sur `next/image`.
   *
   * Twitch renvoie une image grise « hors ligne » quand la chaîne ne diffuse
   * plus ; c'est le comportement voulu — le direct est terminé.
   */
  thumbnailUrl: string;
};

function parse(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

/** L'URL est-elle un direct Twitch ou YouTube reconnaissable ? */
export function isSupportedLiveUrl(url: string): boolean {
  return readLiveEmbed(url, "localhost") !== null;
}

export function readLiveEmbed(url: string, parentHost: string): LiveEmbed | null {
  const parsed = parse(url);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  // Le `parent` de Twitch attend un domaine nu : un hôte avec port le fait
  // échouer, et c'est la forme que porte `headers().host` en développement.
  const parent = parentHost.split(":")[0];

  if (host === "twitch.tv" || host === "m.twitch.tv") {
    const channel = parsed.pathname.split("/").filter(Boolean)[0];
    if (!channel) {
      return null;
    }

    return {
      platform: "twitch",
      embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}`,
      channelUrl: `https://twitch.tv/${channel}`,
      label: `twitch.tv/${channel}`,
      thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(channel)}-640x360.jpg`,
    };
  }

  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com") {
    const videoId =
      host === "youtu.be"
        ? parsed.pathname.split("/").filter(Boolean)[0]
        : (parsed.searchParams.get("v") ??
          (parsed.pathname.startsWith("/live/") ? parsed.pathname.split("/").filter(Boolean)[1] : null) ??
          (parsed.pathname.startsWith("/embed/") ? parsed.pathname.split("/").filter(Boolean)[1] : null));

    if (!videoId) {
      return null;
    }

    return {
      platform: "youtube",
      embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
      channelUrl: `https://www.youtube.com/watch?v=${videoId}`,
      label: `youtube.com/${videoId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    };
  }

  return null;
}
