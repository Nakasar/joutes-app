import { getTranslations } from "next-intl/server";

import { SocialLinkIcon } from "@/components/SocialLinkIcon.tsx";
import { readGameLinks } from "@/lib/constants/game-links.ts";
import { readLinkKind } from "@/lib/users/links.ts";
import type { Game } from "@/lib/types/Game";

/**
 * Le site de l'éditeur et ses réseaux.
 *
 * Placée en fin de fiche, avec la communauté : ces liens mènent **hors** de
 * Joutes, et les proposer avant les outils du jeu inviterait à partir avant
 * d'avoir vu ce qu'il y a ici.
 *
 * L'icône est déduite du domaine, jamais du nom du champ. Deux raisons : la
 * règle est déjà celle des profils (`lib/users/links.ts`), et un lien collé
 * dans le mauvais champ afficherait sinon la marque d'un réseau qui n'est pas
 * le sien.
 *
 * Rien à afficher, rien du tout : un jeu sans liens n'a pas de cadre vide.
 */
export default async function GamePublisherLinks({ game }: { game: Game }) {
  const links = readGameLinks(game.links);

  if (links.length === 0) {
    return null;
  }

  const t = await getTranslations("Games.detail.links");

  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-bold text-white">{t("title")}</h2>
      <p className="text-gray-400">{t("description", { gameName: game.name })}</p>

      <ul className="flex flex-wrap gap-3">
        {links.map((link) => (
          <li key={link.key}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-gray-200 backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <SocialLinkIcon kind={readLinkKind(link.url)} className="size-4 shrink-0" />
              <span className="text-sm font-medium">{link.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
