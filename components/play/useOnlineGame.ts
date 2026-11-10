"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { appendJournal, type GameFeed } from "@/components/play/game-feed";
import type { EngineAction, EngineTold, EngineUpdate } from "@/lib/engine/types";

type ServerMessage =
  | { type: "welcome"; game: string; role: string; seat: number | null; name: string }
  | ({ type: "update" } & EngineUpdate)
  | { type: "presence"; seat: number; connected: boolean }
  | { type: "error"; message: string }
  | { type: "pong" };

const PING_MS = 25_000;
const MAX_RETRY_MS = 15_000;

/**
 * Une partie sur un serveur de parties. `url` est l'adresse WebSocket complète,
 * ticket compris. La connexion se rétablit seule : le serveur renvoie alors
 * les évènements manqués depuis le dernier vu (`since`).
 */
export function useOnlineGame(url: string | null): GameFeed {
  const socket = useRef<WebSocket | null>(null);
  const seen = useRef(0);
  const [status, setStatus] = useState<GameFeed["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<EngineUpdate | null>(null);
  const [journal, setJournal] = useState<EngineTold[]>([]);
  const [seat, setSeat] = useState<number | null>(null);
  const [away, setAway] = useState<number[]>([]);

  useEffect(() => {
    if (!url) return;
    let closed = false;
    let retry = 0;
    let welcomed = false;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;

    const connect = () => {
      const separator = url.includes("?") ? "&" : "?";
      const ws = new WebSocket(`${url}${separator}since=${seen.current}`);
      socket.current = ws;

      ws.onopen = () => {
        retry = 0;
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, PING_MS);
      };

      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "welcome") {
          welcomed = true;
          setSeat(message.seat);
          setStatus("ready");
          setError(null);
        } else if (message.type === "update") {
          const next: EngineUpdate = {
            seq: message.seq,
            view: message.view,
            events: message.events,
            prompt: message.prompt,
          };
          // Le serveur n'envoie que la suite de ce qu'on a vu ; un message
          // en retard (course entre deux envois) ne doit pas doubler le récit.
          if (next.seq > seen.current) {
            seen.current = next.seq;
            setJournal((previous) => appendJournal(previous, next.events));
          }
          setUpdate(next);
        } else if (message.type === "presence") {
          setAway((previous) =>
            message.connected
              ? previous.filter((value) => value !== message.seat)
              : previous.includes(message.seat)
                ? previous
                : [...previous, message.seat],
          );
        } else if (message.type === "error") {
          setError(message.message);
        }
      };

      ws.onclose = (event) => {
        window.clearInterval(pingTimer);
        if (closed) return;
        // 1008 : le serveur refuse le ticket. Réessayer ne changerait rien.
        if (event.code === 1008) {
          setStatus("error");
          setError(event.reason || null);
          return;
        }
        setStatus((previous) => (previous === "ready" || previous === "reconnecting" ? "reconnecting" : previous));
        retry += 1;
        // Jamais entré après plusieurs essais : ticket refusé ou serveur
        // injoignable. Le navigateur ne dit pas lequel.
        if (retry > 3 && !welcomed) {
          setStatus("error");
          return;
        }
        retryTimer = window.setTimeout(connect, Math.min(MAX_RETRY_MS, 500 * 2 ** Math.min(retry, 5)));
      };
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket.current?.close();
      socket.current = null;
    };
  }, [url]);

  const act = useCallback((action: EngineAction) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) {
      setError(null);
      ws.send(JSON.stringify({ type: "act", action }));
    }
  }, []);

  return { status, error, update, journal, seat, away, act };
}
