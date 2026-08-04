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

export type LiveStopwatch = {
  running: boolean;
  startedAt?: string;
  elapsedSeconds?: number;
} | null;

// Secondes écoulées depuis le départ du chronomètre (phases puzzle), corrigées
// du décalage d'horloge serveur/client. En pause, renvoie le temps figé.
// Renvoie null si le chronomètre n'a jamais été lancé.
export function stopwatchElapsedSeconds(
  stopwatch: LiveStopwatch,
  serverOffsetMs: number
): number | null {
  if (!stopwatch) return null;
  if (stopwatch.running && stopwatch.startedAt) {
    const startedAtMs = new Date(stopwatch.startedAt).getTime();
    // Le chronomètre ne recule jamais : une horloge cliente en avance sur le
    // serveur ne doit pas afficher un temps négatif au premier dixième.
    return Math.max(0, (Date.now() + serverOffsetMs - startedAtMs) / 1000);
  }
  if (!stopwatch.running && stopwatch.elapsedSeconds !== undefined) {
    return stopwatch.elapsedSeconds;
  }
  return null;
}

// Temps écoulé tel qu'il s'affiche. Un chronomètre jamais lancé (ou remis à
// zéro) ne montre pas « 00:00 » : ce serait un temps, là où il n'y en a pas
// encore — et le libellé juste à côté dit « non lancé ».
export function formatStopwatch(elapsedSeconds: number | null): string {
  return elapsedSeconds === null ? "—" : formatDuration(elapsedSeconds);
}

// Indique si le chronomètre est en pause : arrêté, mais sur un temps écoulé
// mémorisé — y compris 0, une pause juste après le départ reste une pause. Un
// chronomètre jamais lancé (ou remis à zéro) n'en a pas, et n'est donc pas
// « en pause » mais « non lancé ».
export function stopwatchIsPaused(stopwatch: LiveStopwatch): boolean {
  return !!stopwatch && !stopwatch.running && stopwatch.elapsedSeconds !== undefined;
}
