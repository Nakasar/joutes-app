// Formate une durée en secondes en mm:ss (ou h:mm:ss au-delà d'une heure).
// Une valeur négative (minuteur épuisé) est préfixée d'un « - ».
export function formatDuration(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  const s = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const core =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return negative ? `-${core}` : core;
}

export type LiveTimer = { durationSeconds: number; endsAt?: string; running: boolean } | null;

// Secondes restantes d'un minuteur (peut être négatif), corrigées du décalage
// d'horloge serveur/client. Renvoie null si le minuteur ne tourne pas.
export function timerRemainingSeconds(timer: LiveTimer, serverOffsetMs: number): number | null {
  if (!timer || !timer.running || !timer.endsAt) return null;
  const endsAtMs = new Date(timer.endsAt).getTime();
  return (endsAtMs - (Date.now() + serverOffsetMs)) / 1000;
}
