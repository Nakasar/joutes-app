import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDuration,
  stopwatchElapsedSeconds,
  stopwatchIsPaused,
} from "@/lib/tournament-timer";

/**
 * Tests du chronomètre des phases chronométrées. Ce qui se joue ici est la
 * distinction entre « en pause » et « jamais lancé » : les deux sont arrêtés,
 * et c'est elle qui décide du libellé affiché en salle, du bouton (« Reprendre »
 * ou « Lancer ») et de la possibilité de relever un temps.
 *
 * Exécution : `npm run test`.
 */

describe("stopwatchElapsedSeconds", () => {
  it("renvoie null sans chronomètre", () => {
    assert.equal(stopwatchElapsedSeconds(null, 0), null);
  });

  it("renvoie null sur un chronomètre remis à zéro (jamais reparti)", () => {
    // `resetStopwatch` retire le temps écoulé : l'état est « non lancé », pas
    // « en pause à 00:00 ».
    assert.equal(stopwatchElapsedSeconds({ running: false }, 0), null);
  });

  it("renvoie le temps figé d'un chronomètre en pause", () => {
    assert.equal(stopwatchElapsedSeconds({ running: false, elapsedSeconds: 42 }, 0), 42);
  });

  it("mesure depuis l'instant de départ, corrigé du décalage serveur", () => {
    const startedAt = new Date(Date.now() - 10_000).toISOString();
    const elapsed = stopwatchElapsedSeconds({ running: true, startedAt }, 0);
    assert.ok(elapsed !== null && Math.abs(elapsed - 10) < 1);

    // Serveur en avance d'une minute : le temps écoulé l'est d'autant.
    const shifted = stopwatchElapsedSeconds({ running: true, startedAt }, 60_000);
    assert.ok(shifted !== null && Math.abs(shifted - 70) < 1);
  });

  it("ne descend jamais sous zéro quand l'horloge du poste est en avance", () => {
    const startedAt = new Date(Date.now() + 5_000).toISOString();
    assert.equal(stopwatchElapsedSeconds({ running: true, startedAt }, 0), 0);
  });
});

describe("stopwatchIsPaused", () => {
  it("est faux sans chronomètre et après une remise à zéro", () => {
    assert.equal(stopwatchIsPaused(null), false);
    assert.equal(stopwatchIsPaused({ running: false }), false);
  });

  it("est faux pendant que le chronomètre tourne", () => {
    assert.equal(stopwatchIsPaused({ running: true, startedAt: new Date().toISOString() }), false);
  });

  it("est vrai à l'arrêt sur un temps mémorisé, zéro compris", () => {
    assert.equal(stopwatchIsPaused({ running: false, elapsedSeconds: 42 }), true);
    // Une pause juste après le départ reste une pause.
    assert.equal(stopwatchIsPaused({ running: false, elapsedSeconds: 0 }), true);
  });
});

describe("formatDuration", () => {
  it("formate en mm:ss, et en h:mm:ss au-delà d'une heure", () => {
    assert.equal(formatDuration(0), "00:00");
    assert.equal(formatDuration(65), "01:05");
    assert.equal(formatDuration(3661), "1:01:01");
  });

  it("préfixe d'un signe un minuteur épuisé", () => {
    assert.equal(formatDuration(-5), "-00:05");
  });
});
