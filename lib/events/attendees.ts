import type { ParticipantsVisibility } from "@/lib/types/Event";

/**
 * La liste publique des inscrits d'un événement, « Qui vient ? ».
 *
 * Elle ne montre que des pseudos, jamais d'e-mails, et l'organisation choisit
 * pour chaque événement qui la voit (`Event.participantsVisibility`). La liste
 * complète, statuts et e-mails compris, reste à l'organisation.
 */

export const PARTICIPANTS_VISIBILITIES: readonly ParticipantsVisibility[] = [
  "public",
  "participants",
  "organizers",
];

export const ATTENDEES_PAGE_SIZE = 12;

export function readParticipantsVisibility(value: unknown): ParticipantsVisibility {
  return PARTICIPANTS_VISIBILITIES.includes(value as ParticipantsVisibility)
    ? (value as ParticipantsVisibility)
    : "public";
}

/** La personne qui regarde peut-elle lire la liste des inscrits ? */
export function canSeeAttendees(
  visibility: ParticipantsVisibility | undefined,
  viewer: { isManager: boolean; isParticipant: boolean }
): boolean {
  if (viewer.isManager) return true;
  switch (visibility ?? "public") {
    case "public":
      return true;
    case "participants":
      return viewer.isParticipant;
    case "organizers":
      return false;
  }
}

/** Minuscules et sans accents : « élo » trouve « Élodie ». */
/** Les deux premières lettres ou chiffres d'un pseudo, pour l'avatar par défaut : « L'Ours » donne « LO ». */
export function initials(name: string): string {
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2);
}

export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type AttendeesPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Filtre une liste déjà ordonnée par une saisie libre, puis en découpe une
 * page. Une page hors bornes est ramenée à la dernière, pour qu'une recherche
 * qui réduit la liste ne laisse pas un écran vide.
 */
export function pageAttendees<T>(
  list: readonly T[],
  {
    query = "",
    page = 0,
    pageSize = ATTENDEES_PAGE_SIZE,
    text,
  }: { query?: string; page?: number; pageSize?: number; text: (item: T) => string[] }
): AttendeesPage<T> {
  const key = searchKey(query);
  const filtered = key
    ? list.filter((item) => text(item).some((value) => searchKey(value).includes(key)))
    : [...list];
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(Math.max(0, Math.floor(page) || 0), pageCount - 1);
  return {
    items: filtered.slice(current * size, current * size + size),
    total: filtered.length,
    page: current,
    pageCount,
  };
}
