import type { PosterPeriod, PosterStyleKey } from "@/lib/posters/styles";

/**
 * Une affiche qu'un joueur a gardée.
 *
 * C'est une **recette**, pas un document : les lieux, les jeux, la période et
 * l'habillage — mais jamais la date. Une affiche enregistrée le 3 septembre et
 * rouverte en novembre montre la semaine de novembre, ce qui est tout l'intérêt
 * d'en garder une : on la reprend chaque semaine sans la recomposer. Garder la
 * date en ferait un instantané périmé au premier lundi suivant.
 */
export type SavedPoster = {
  id: string;
  userId: string;
  name: string;
  /** Les lieux, dans l'ordre choisi : c'est celui que l'affiche écrit. */
  lairIds: string[];
  /** Les jeux retenus ; vide vaut « tous les jeux de ces lieux ». */
  gameIds: string[];
  period: PosterPeriod;
  style: PosterStyleKey;
  showAttendance: boolean;
  gameLogos: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Ce qu'un écran envoie pour créer ou réécrire une affiche. */
export type SavedPosterInput = Omit<SavedPoster, "id" | "userId" | "createdAt" | "updatedAt">;
