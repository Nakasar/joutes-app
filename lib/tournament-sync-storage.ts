// Gestion côté navigateur des clés de synchronisation joueur (tpsk_...),
// stockées dans le localStorage par tournoi. Ces clés permettent aux joueurs
// (y compris invités sans compte) d'accéder au portail joueur d'un tournoi.

const STORAGE_KEY = "joutes-tournament-sync-keys";

export function getSyncKeys(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function getSyncKey(tournamentId: string): string | undefined {
  return getSyncKeys()[tournamentId];
}

export function storeSyncKey(tournamentId: string, key: string): void {
  const keys = getSyncKeys();
  keys[tournamentId] = key;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function removeSyncKey(tournamentId: string): void {
  const keys = getSyncKeys();
  delete keys[tournamentId];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}
