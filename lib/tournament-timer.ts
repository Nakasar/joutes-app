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

export type LiveTimer = {
  durationSeconds: number;
  endsAt?: string;
  running: boolean;
  remainingSeconds?: number;
} | null;

// Secondes restantes d'un minuteur (peut être négatif), corrigées du décalage
// d'horloge serveur/client. En pause, renvoie le temps restant figé. Renvoie
// null si aucun minuteur n'est actif ou en pause.
export function timerRemainingSeconds(timer: LiveTimer, serverOffsetMs: number): number | null {
  if (!timer) return null;
  if (timer.running && timer.endsAt) {
    const endsAtMs = new Date(timer.endsAt).getTime();
    return (endsAtMs - (Date.now() + serverOffsetMs)) / 1000;
  }
  if (!timer.running && timer.remainingSeconds !== undefined) {
    return timer.remainingSeconds;
  }
  return null;
}

// Indique si le minuteur est en pause (arrêté mais avec un temps restant figé).
export function timerIsPaused(timer: LiveTimer): boolean {
  return !!timer && !timer.running && timer.remainingSeconds !== undefined;
}
