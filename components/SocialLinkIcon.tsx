import { Facebook, Globe, Instagram, MessageCircle, Twitch, Youtube } from "lucide-react";

import {
  BlueskyMark,
  MastodonMark,
  RedditMark,
  TikTokMark,
  XMark,
} from "@/components/brand/BrandMarks.tsx";
import type { UserLinkKind } from "@/lib/users/links.ts";

/**
 * L'icône d'un lien social, déduite de son domaine.
 *
 * **Jamais choisie.** Un menu de plus serait un choix de plus à se tromper, et
 * un lien Twitch portant une icône YouTube ment plus qu'il n'informe. C'est
 * `readLinkKind` (`lib/users/links.ts`) qui tranche, à partir de l'hôte.
 *
 * Les marques absentes de `lucide-react` — Bluesky, X, TikTok, Mastodon,
 * Reddit — viennent de `components/brand/BrandMarks.tsx`. Elles ont longtemps
 * pris l'arobase à la place, ce qui se défendait tant que ces liens n'étaient
 * qu'une liste sous un profil : le libellé disait déjà tout. La grille des
 * publications d'un éditeur (`docs/GAME_SOCIAL.md`) a changé la donne — le logo
 * y est ce qui se lit d'un coup d'œil, et trois plateformes ne peuvent pas y
 * porter le même symbole.
 *
 * Le remplacement est **global** et non réservé à cette grille : deux marques
 * différentes pour un même compte sur un même écran — un papillon dans la
 * grille, une arobase trois cents pixels plus bas sous « Suivre l'éditeur » —
 * serait pire que l'une ou l'autre appliquée partout.
 *
 * Le globe reste pour ce qu'on n'a pas reconnu.
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
    // `lucide-react` n'a pas de marque Discord ; sa bulle de discussion est un
    // substitut assumé, plus juste qu'un logo approximatif.
    case "discord":
      return <MessageCircle className={className} aria-hidden />;
    case "bluesky":
      return <BlueskyMark className={className} />;
    case "x":
      return <XMark className={className} />;
    case "tiktok":
      return <TikTokMark className={className} />;
    case "mastodon":
      return <MastodonMark className={className} />;
    case "reddit":
      return <RedditMark className={className} />;
    default:
      return <Globe className={className} aria-hidden />;
  }
}
