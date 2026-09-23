import type { LairNewsItem } from "@/lib/types/Lair";

/**
 * L'annonce que le lieu vient d'épingler, s'il en a épinglé une nouvelle.
 *
 * Les actualités s'enregistrent en bloc : c'est en comparant l'avant et
 * l'après qu'on sait si un épinglage a eu lieu. Une annonce déjà épinglée
 * qu'on retouche ne compte pas — ses abonnés ont déjà été prévenus —, pas plus
 * qu'un désépinglage.
 *
 * Module pur : c'est ce qui le rend testable.
 */
export function newlyPinnedNews(
  previous: LairNewsItem[] | undefined,
  next: LairNewsItem[]
): LairNewsItem | null {
  const pinnedBefore = new Set((previous ?? []).filter((item) => item.pinned).map((item) => item.id));
  return next.find((item) => item.pinned && !pinnedBefore.has(item.id)) ?? null;
}
