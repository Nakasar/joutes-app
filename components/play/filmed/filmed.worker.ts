/// <reference lib="webworker" />

import init, { TableReader, Tracking } from "@/lib/engine/track/pkg/joutes_track.js";
import type { FilmedReply, FilmedRequest } from "@/components/play/filmed/protocol";
import type { Found, Glance, Observation, Outcome } from "@/lib/filmed/types";

/**
 * La lecture de la table filmée et le suivi de la partie tournent ici : lire
 * une image entière prend plusieurs secondes, que la page ne doit pas sentir.
 * La vidéo ne quitte pas l'ordinateur : tout se calcule dans ce fil.
 *
 * Message reçu : `{ id, request }` ; rendu : `{ id, reply }` ou `{ id, error }`,
 * et `{ progress }` pendant l'apprentissage des cartes.
 */
let ready: Promise<unknown> | undefined;
let reader: TableReader | undefined;
let tracking: Tracking | undefined;
/** La dernière observation confrontée : la même ne repose pas la même question. */
let lastSeen: string | undefined;
/** Les cartes déjà apprises : changer de deck n'apprend que les nouvelles. */
const learned = new Set<string>();

let canvas: OffscreenCanvas | undefined;

function pixels(frame: ImageBitmap, width = frame.width, height = frame.height): ImageData {
  if (!canvas || canvas.width !== width || canvas.height !== height) canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas");
  context.drawImage(frame, 0, 0, width, height);
  frame.close();
  return context.getImageData(0, 0, width, height);
}

function bytes(image: ImageData): Uint8Array {
  return new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
}

function needReader(): TableReader {
  reader ??= new TableReader("{}");
  return reader;
}

function needTracking(): Tracking {
  if (!tracking) throw new Error("no game");
  return tracking;
}

function table(): unknown {
  return JSON.parse(needTracking().table()) as unknown;
}

async function handle(request: FilmedRequest): Promise<FilmedReply> {
  switch (request.kind) {
    case "learn": {
      const failed: string[] = [];
      const todo = request.cards.filter((card) => !learned.has(card.id));
      let done = 0;
      for (const card of todo) {
        try {
          const response = await fetch(card.url);
          if (!response.ok) throw new Error(String(response.status));
          const bitmap = await createImageBitmap(await response.blob());
          // La lecture réduit la carte à 260 pixels de large : inutile de lui donner plus de 400.
          const scale = Math.min(1, 400 / bitmap.width);
          const image = pixels(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
          needReader().add(card.id, bytes(image), image.width, image.height);
          learned.add(card.id);
        } catch {
          failed.push(card.id);
        }
        done += 1;
        self.postMessage({ progress: { done, total: todo.length } });
      }
      return { learned: learned.size, failed };
    }
    case "card":
      needReader().set_card(request.min, request.max);
      return {};
    case "read": {
      const image = pixels(request.frame);
      const found = JSON.parse(needReader().read(bytes(image), image.width, image.height, 0, 0, 0, 0)) as Found[];
      return { found };
    }
    case "watch": {
      const image = pixels(request.frame);
      return { glance: JSON.parse(needReader().watch(bytes(image), image.width, image.height)) as Glance };
    }
    case "forget":
      needReader().reset();
      return {};
    case "start":
      tracking?.free();
      tracking = new Tracking(JSON.stringify(request.config), JSON.stringify(request.battlefields), request.seed);
      lastSeen = undefined;
      return { table: table() };
    case "observe": {
      const game = needTracking();
      const seen = game.read_table(JSON.stringify(request.spotted), JSON.stringify(request.layout));
      if (seen === lastSeen) return { outcome: { outcome: "unchanged" }, repeated: true, table: table() };
      lastSeen = seen;
      const outcome = JSON.parse(game.observe(seen)) as Outcome;
      return { outcome, repeated: false, table: table(), observation: JSON.parse(seen) as Observation };
    }
    case "choose": {
      const explanation = JSON.parse(needTracking().choose(request.index)) as FilmedReply["explanation"];
      return { explanation, table: table() };
    }
    case "repaired": {
      const explanation = JSON.parse(needTracking().accept_nearest()) as FilmedReply["explanation"];
      return { explanation, table: table() };
    }
    case "force": {
      const game = needTracking();
      const seen = game.read_table(JSON.stringify(request.spotted), JSON.stringify(request.layout));
      const notes = JSON.parse(game.force(seen)) as string[];
      lastSeen = seen;
      return { notes, table: table() };
    }
    case "points":
      needTracking().set_points(request.seat, request.points);
      lastSeen = undefined;
      return { table: table() };
  }
}

self.onmessage = async (message: MessageEvent<{ id: number; request: FilmedRequest }>) => {
  const { id, request } = message.data;
  try {
    ready ??= init();
    await ready;
    self.postMessage({ id, reply: await handle(request) });
  } catch (error) {
    if (!reader && !tracking) ready = undefined;
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
