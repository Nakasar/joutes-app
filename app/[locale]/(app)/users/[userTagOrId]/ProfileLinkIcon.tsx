import { AtSign, Globe, MessageCircle, Twitch, Youtube } from "lucide-react";

import type { UserLinkKind } from "@/lib/users/links.ts";

/**
 * L'icône d'un lien, déduite de son domaine.
 *
 * `lucide-react` ne porte pas de marque pour Bluesky, TikTok, Mastodon ni X :
 * plutôt qu'un logo approximatif, elles prennent l'arobase — le symbole du
 * compte, qui est bien ce dont il s'agit. Le globe reste pour ce qu'on n'a pas
 * reconnu.
 */
export function ProfileLinkIcon({
  kind,
  className,
}: {
  kind: UserLinkKind;
  className?: string;
}) {
  switch (kind) {
    case "twitch":
      return <Twitch className={className} aria-hidden />;
    case "youtube":
      return <Youtube className={className} aria-hidden />;
    case "discord":
      return <MessageCircle className={className} aria-hidden />;
    case "bluesky":
    case "instagram":
    case "tiktok":
    case "x":
    case "mastodon":
      return <AtSign className={className} aria-hidden />;
    default:
      return <Globe className={className} aria-hidden />;
  }
}
