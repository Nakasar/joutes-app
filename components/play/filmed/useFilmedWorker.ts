"use client";

import { useCallback, useEffect, useRef } from "react";

import type { FilmedProgress, FilmedReply, FilmedRequest } from "@/components/play/filmed/protocol";

type Waiting = { resolve: (reply: FilmedReply) => void; reject: (error: Error) => void };

/**
 * Le fil de lecture et de suivi de la table filmée. `call` envoie une demande
 * et rend sa réponse ; les demandes sont traitées dans l'ordre, une à la fois.
 */
export function useFilmedWorker(onProgress?: (progress: FilmedProgress) => void) {
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(new Map<number, Waiting>());
  const next = useRef(1);
  const progress = useRef(onProgress);
  useEffect(() => {
    progress.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const pending = waiting.current;
    return () => {
      worker.current?.terminate();
      worker.current = null;
      for (const one of pending.values()) one.reject(new Error("closed"));
      pending.clear();
    };
  }, []);

  return useCallback((request: FilmedRequest): Promise<FilmedReply> => {
    if (!worker.current) {
      const created = new Worker(new URL("./filmed.worker.ts", import.meta.url), { type: "module" });
      created.onmessage = (
        message: MessageEvent<{ id?: number; reply?: FilmedReply; error?: string; progress?: FilmedProgress }>,
      ) => {
        const { id, reply, error, progress: step } = message.data;
        if (step) progress.current?.(step);
        if (id === undefined) return;
        const one = waiting.current.get(id);
        waiting.current.delete(id);
        if (error !== undefined) one?.reject(new Error(error));
        else one?.resolve(reply ?? {});
      };
      worker.current = created;
    }
    const id = next.current++;
    return new Promise<FilmedReply>((resolve, reject) => {
      waiting.current.set(id, { resolve, reject });
      const transfer = "frame" in request ? [request.frame] : [];
      worker.current?.postMessage({ id, request }, transfer);
    });
  }, []);
}
