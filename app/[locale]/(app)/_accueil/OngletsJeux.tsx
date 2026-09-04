import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { selectMenuGames } from "@/lib/games/nav-menu.ts";

import { lireViewer } from "./accueil-data.ts";

/** Ce que la barre propose quand on ne sait rien des goûts du visiteur. */
const JEUX_PAR_DEFAUT = ["riftbound", "mtg", "swu"];

/**
 * Le filtre par jeu, en onglets.
 *
 * Le choix passe par l'URL plutôt que par un état de client : la page reste
 * ainsi rendue au serveur, partageable et navigable en arrière — et le
 * calendrier emploie déjà `gameId` de la même façon.
 *
 * Il commande le HAUT de la page — les directs, l'agenda, le fil — et laisse
 * la colonne de droite intacte : mes lieux et mes decks ne dépendent pas du
 * jeu que je regarde. C'est un choix, pas un oubli.
 */
export default async function OngletsJeux({
  jeuChoisi,
  params,
}: {
  jeuChoisi: string | null;
  params: Record<string, string | undefined>;
}) {
  const [t, viewer, tousLesJeux] = await Promise.all([
    getTranslations("Home"),
    lireViewer(),
    readAllGames(),
  ]);

  const suivis = tousLesJeux.filter((jeu) => viewer?.games?.includes(jeu.id));
  const defauts = tousLesJeux.filter((jeu) => jeu.slug && JEUX_PAR_DEFAUT.includes(jeu.slug));

  const { source, games } = selectMenuGames({
    followed: suivis,
    favoriteIds: viewer?.favoriteGames ?? [],
    defaults: defauts.length > 0 ? defauts : tousLesJeux.slice(0, 3),
  });

  const lien = (jeu: string | undefined) => ({
    pathname: "/" as const,
    query: { ...params, jeu },
  });

  return (
    <nav className="flex flex-wrap items-end gap-1.5" aria-label={t("jeux.legende")}>
      <Onglet href={lien(undefined)} actif={jeuChoisi === null}>
        {source === "defaults" ? t("jeux.tous") : t("jeux.tousLesMiens")}
      </Onglet>
      {games.map((jeu) => (
        <Onglet key={jeu.id} href={lien(jeu.slug ?? jeu.id)} actif={jeuChoisi === jeu.id}>
          {jeu.name}
        </Onglet>
      ))}
    </nav>
  );
}

function Onglet({
  href,
  actif,
  children,
}: {
  href: { pathname: "/"; query: Record<string, string | undefined> };
  actif: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={cn(
        // Les onglets ne penchent pas : ce sont des commandes, pas du papier.
        "inline-flex h-9 shrink-0 items-center rounded-t-lg border border-b-0 px-4 text-sm font-medium whitespace-nowrap transition-colors",
        actif
          ? "bg-primary text-primary-foreground h-10 border-transparent"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
