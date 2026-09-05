import { AtSign, Facebook, Globe, Instagram, MessageCircle, Twitch, Youtube } from "lucide-react";

import type { UserLinkKind } from "@/lib/users/links.ts";

/**
 * L'icône d'un lien social, déduite de son domaine.
 *
 * **Jamais choisie.** Un menu de plus serait un choix de plus à se tromper, et
 * un lien Twitch portant une icône YouTube ment plus qu'il n'informe. C'est
 * `readLinkKind` (`lib/users/links.ts`) qui tranche, à partir de l'hôte.
 *
 * `lucide-react` ne porte pas de marque pour Bluesky, TikTok, Mastodon, Reddit
 * ni X : plutôt qu'un logo approximatif, elles prennent l'arobase — le symbole
 * du compte, qui est bien ce dont il s'agit. Le globe reste pour ce qu'on n'a
 * pas reconnu.
 *
 * Partagée par les profils et les fiches de jeu : les deux affichent les mêmes
 * plateformes, et une seconde copie de cette table divergerait au premier
 * réseau ajouté.
 */
export function SocialLinkIcon({
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
    case "instagram":
      return <Instagram className={className} aria-hidden />;
    case "facebook":
      return <Facebook className={className} aria-hidden />;
    case "discord":
      return <MessageCircle className={className} aria-hidden />;
    case "bluesky":
    case "tiktok":
    case "x":
    case "mastodon":
    case "reddit":
      return <AtSign className={className} aria-hidden />;
    default:
      return <Globe className={className} aria-hidden />;
  }
}
