"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, Hand, Loader2, Pause, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { filmedArtAction } from "@/app/[locale]/(app)/games/riftbound/play/filmed/actions";
import { loadLobby, type Lobby } from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { AlertCard, CorrectDialog, DoubtCard, Journal, QuestionCard, TablePanel } from "@/components/play/filmed/FilmedLive";
import { FilmedReport } from "@/components/play/filmed/FilmedReport";
import { FilmedSetup, type SeatSetup, type SourceKind } from "@/components/play/filmed/FilmedSetup";
import { FilmedStage, SEAT_COLORS } from "@/components/play/filmed/FilmedStage";
import type { FilmedProgress } from "@/components/play/filmed/protocol";
import { useFilmedWorker } from "@/components/play/filmed/useFilmedWorker";
import { useTableCards } from "@/components/play/useTableCards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import type { LobbyDeck } from "@/lib/engine/lobby-decks";
import type { EngineConfig, EngineView } from "@/lib/engine/types";
import { clock, exportJournal, type Entry, type EntryKind } from "@/lib/filmed/journal";
import {
  aroundBattlefields,
  battlefieldsOnTable,
  cardRange,
  cardWidth,
  codeOf,
  defaultLayout,
  doubtful,
  liveOverrides,
  spotted,
} from "@/lib/filmed/layout";
import type { Area, Deviation, Explanation, Found, Layout, Override } from "@/lib/filmed/types";
import { cn } from "@/lib/utils";

/** L'intervalle entre deux images données à la lecture, en secondes. */
const STEP = 0.5;
/** La largeur des images gardées pour « Revoir l'image ». */
const SHOT_WIDTH = 960;

type Phase = "setup" | "live" | "report";
type Size = { width: number; height: number };
type Open = { entry: number; time: number };

const EMPTY_SEAT: SeatSetup = { name: "", deck: null, learning: false, failed: 0 };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Place une vidéo à un instant et attend que l'image y soit. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}

function snapshot(video: HTMLVideoElement): Promise<string | undefined> {
  const scale = Math.min(1, SHOT_WIDTH / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : undefined), "image/jpeg", 0.75));
}

/**
 * La table filmée : suivre une partie réelle de Riftbound à la caméra, ou la
 * revoir depuis une vidéo, pour l'arbitrer. La lecture de l'image et le moteur
 * tournent dans le navigateur ; la vidéo ne quitte pas l'ordinateur.
 */
export function FilmedTable() {
  const t = useTranslations("Games.Filmed");
  const tPlay = useTranslations("Games.Play");
  const cards = useTableCards();
  const [progress, setProgress] = useState<FilmedProgress | null>(null);
  const call = useFilmedWorker(setProgress);
  const video = useRef<HTMLVideoElement | null>(null);

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");

  // La préparation.
  const [seats, setSeats] = useState<SeatSetup[]>([EMPTY_SEAT, EMPTY_SEAT]);
  const [sourceKind, setSourceKind] = useState<SourceKind>("camera");
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [device, setDevice] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [trial, setTrial] = useState<{ found: number; sure: number; cardWidth: number | null } | null>(null);
  const [reading, setReading] = useState(false);
  const [battlefields, setBattlefields] = useState<(string | null)[]>([null, null]);
  const [first, setFirst] = useState(0);
  const [underway, setUnderway] = useState(false);
  const [starting, setStarting] = useState(false);

  // Le suivi.
  const [view, setView] = useState<EngineView | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [alert, setAlert] = useState<(Open & { deviation: Deviation }) | null>(null);
  const [question, setQuestion] = useState<(Open & { options: Explanation[] }) | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState(false);
  const [glance, setGlance] = useState<"moving" | "still" | "read">("still");
  const [busy, setBusy] = useState(false);
  const [showFrames, setShowFrames] = useState(true);
  const [correcting, setCorrecting] = useState(false);
  const [review, setReview] = useState<Entry | null>(null);
  const [now, setNow] = useState(0);
  /** La largeur d'une carte dans l'image, en pixels, mesurée à l'essai de lecture. */
  const [cardPx, setCardPx] = useState(150);
  /** Ce que le rapport compte, relevé à la fin du suivi. */
  const [tally, setTally] = useState({ moving: 0, seen: 0, manual: 0 });

  // Ce que la boucle de lecture lit sans se relancer à chaque changement.
  const live = useRef({ layout, overrides, card: cardPx, view, alert, question, found, force: false });
  useEffect(() => {
    live.current = { ...live.current, layout, overrides, card: cardPx, view, alert, question, found };
  }, [layout, overrides, cardPx, view, alert, question, found]);
  const counters = useRef({ entry: 1, startedAt: 0, moving: 0, manual: 0, seen: new Set<string>() });
  const shots = useRef<string[]>([]);

  const fail = useCallback(
    (error: unknown) => {
      console.error("Table filmée :", error);
      setFailure(t("error.generic"));
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    void loadLobby().then((result) => {
      if (cancelled) return;
      if (result.ok) setLobby(result.lobby);
      else setFailure(tPlay(`error.${result.error}`));
    });
    return () => {
      cancelled = true;
    };
  }, [tPlay]);

  // Les images gardées pour la relecture ne vivent que dans cet onglet.
  useEffect(() => {
    const kept = shots.current;
    return () => kept.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const cardName = useCallback((id: string) => cards[codeOf(id)]?.name ?? codeOf(id), [cards]);
  const seatName = useCallback(
    (seat: number) => seats[seat]?.name.trim() || t("setup.player", { number: seat + 1 }),
    [seats, t],
  );
  const areaLabel = useCallback(
    (area: Area) => {
      if (area.kind === "battlefield") {
        const code = battlefields[area.index];
        return code ? cardName(code) : t("zone.battlefield", { number: area.index + 1 });
      }
      return t(`zone.${area.kind}`, { name: seatName(area.index) });
    },
    [battlefields, cardName, seatName, t],
  );

  // --- La source de l'image -------------------------------------------------

  const closed = phase === "report";
  useEffect(() => {
    const element = video.current;
    if (!element || closed) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const opened = () => {
      if (cancelled || !element.videoWidth) return;
      const next = { width: element.videoWidth, height: element.videoHeight };
      setSize((current) => (current && current.width === next.width && current.height === next.height ? current : next));
      // Les zones par défaut dès que la taille de l'image est connue.
      setLayout((current) => current ?? defaultLayout(next.width, next.height, false));
    };
    element.addEventListener("loadedmetadata", opened);

    if (sourceKind === "camera") {
      element.removeAttribute("src");
      if (!navigator.mediaDevices?.getUserMedia) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- l'accès à la caméra ne se connaît que dans le navigateur
        setSourceError(t("setup.cameraMissing"));
      } else {
        navigator.mediaDevices
          .getUserMedia({
            audio: false,
            video: { ...(device ? { deviceId: { exact: device } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 } },
          })
          .then(async (opening) => {
            if (cancelled) {
              opening.getTracks().forEach((track) => track.stop());
              return;
            }
            stream = opening;
            element.srcObject = opening;
            await element.play().catch(() => undefined);
            setSourceError(null);
            const list = await navigator.mediaDevices.enumerateDevices();
            if (cancelled) return;
            setDevices(list.filter((one) => one.kind === "videoinput").map((one) => ({ id: one.deviceId, label: one.label })));
            const used = opening.getVideoTracks()[0]?.getSettings().deviceId;
            if (used) setDevice((current) => current ?? used);
          })
          .catch(() => {
            if (!cancelled) setSourceError(t("setup.cameraRefused"));
          });
      }
    } else {
      element.srcObject = null;
      // Même fichier : le garder où il en est (retour du rapport).
      if (file && element.src !== file.url) element.src = file.url;
      if (file) setSourceError(null);
    }
    return () => {
      cancelled = true;
      element.removeEventListener("loadedmetadata", opened);
      stream?.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
    };
    // La caméra se ferme au rapport, pas entre la préparation et le suivi.
  }, [sourceKind, device, file, t, closed]);

  function chooseSource(kind: SourceKind) {
    if (kind === sourceKind) return;
    setSourceKind(kind);
    setSize(null);
    setLayout(null);
    setFound([]);
    setTrial(null);
  }

  function chooseFile(picked: File) {
    if (file) URL.revokeObjectURL(file.url);
    setFile({ name: picked.name, url: URL.createObjectURL(picked) });
    setSize(null);
    setLayout(null);
    setFound([]);
    setTrial(null);
  }

  // --- Les decks ------------------------------------------------------------

  function patchSeat(seat: number, patch: Partial<SeatSetup>) {
    setSeats((current) => current.map((one, index) => (index === seat ? { ...one, ...patch } : one)));
  }

  async function chooseDeck(seat: number, deck: LobbyDeck | null) {
    setTrial(null);
    setBattlefields((current) => current.map((code, index) => (index === seat ? null : code)));
    if (!deck?.list) {
      patchSeat(seat, { deck, learning: false, failed: 0 });
      return;
    }
    patchSeat(seat, { deck, learning: true, failed: 0 });
    setProgress(null);
    try {
      const result = await filmedArtAction(deck.id);
      if (!result.ok) {
        patchSeat(seat, { deck: null, learning: false });
        setFailure(tPlay(`error.${result.error}`));
        return;
      }
      const reply = await call({ kind: "learn", cards: result.art });
      patchSeat(seat, { learning: false, failed: reply.failed?.length ?? 0 });
    } catch (error) {
      patchSeat(seat, { deck: null, learning: false });
      fail(error);
    }
  }

  // --- Le calibrage ---------------------------------------------------------

  async function readTrial() {
    const element = video.current;
    if (!element || !size || !layout) return;
    setReading(true);
    setFailure(null);
    try {
      // Sans idée de la taille des cartes, la lecture cherche large.
      await call({ kind: "card", min: 90, max: 320 });
      const frame = await createImageBitmap(element);
      const cardsFound = (await call({ kind: "read", frame })).found ?? [];
      const width = cardWidth(cardsFound);
      const lists = seats.map((seat) => seat.deck?.list?.battlefields ?? []);
      const onTable = battlefieldsOnTable(cardsFound, lists);
      const chosen = battlefields.map((code, index) => onTable[index] ?? code);
      setFound(cardsFound);
      setBattlefields(chosen);
      setTrial({ found: cardsFound.length, sure: cardsFound.filter((card) => card.sure).length, cardWidth: width });
      if (width) {
        setCardPx(width);
        setLayout(aroundBattlefields(layout, cardsFound, chosen, width));
      }
    } catch (error) {
      fail(error);
    } finally {
      setReading(false);
    }
  }

  function turnSideways(sideways: boolean) {
    if (size) setLayout({ ...defaultLayout(size.width, size.height, sideways), facedown: layout?.facedown ?? [[0, 0], [0, 0]] });
  }

  const blocked = !seats.every((seat) => seat.deck?.list)
    ? t("setup.blocked.decks")
    : seats.some((seat) => seat.learning)
      ? t("setup.blocked.learning")
      : !size
        ? t("setup.blocked.source")
        : battlefields.some((code) => !code)
          ? t("setup.blocked.battlefields")
          : null;

  // --- Le suivi -------------------------------------------------------------

  const clockNow = useCallback(() => {
    const element = video.current;
    if (sourceKind === "file" && element) return element.currentTime;
    return (performance.now() - counters.current.startedAt) / 1000;
  }, [sourceKind]);

  const addEntry = useCallback(
    async (kind: EntryKind, lines: string[], table: EngineView | null, extra?: Partial<Entry>): Promise<Entry> => {
      const element = video.current;
      const keep = kind === "deviation" || kind === "question";
      const shot = keep && element ? await snapshot(element).catch(() => undefined) : undefined;
      if (shot) shots.current.push(shot);
      const entry: Entry = {
        id: counters.current.entry++,
        time: clockNow(),
        turn: table?.turn ?? 0,
        seat: table?.turn_seat ?? 0,
        kind,
        lines,
        ...(shot ? { shot } : {}),
        ...extra,
      };
      setEntries((current) => [...current, entry]);
      return entry;
    },
    [clockNow],
  );

  const resolve = useCallback(
    (id: number, resolution: NonNullable<Entry["resolution"]>) => {
      const time = clockNow();
      setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, resolution, resolvedAt: time } : entry)));
    },
    [clockNow],
  );

  /** Ferme l'écart et la question ouverts : la table a changé depuis. */
  const closeOpen = useCallback(
    (how: NonNullable<Entry["resolution"]>) => {
      const { alert: openAlert, question: openQuestion } = live.current;
      if (openAlert) resolve(openAlert.entry, how);
      if (openQuestion) resolve(openQuestion.entry, "superseded");
      live.current.alert = null;
      live.current.question = null;
      setAlert(null);
      setQuestion(null);
    },
    [resolve],
  );

  /**
   * Confronte la table lue à la partie suivie. Rend vrai si l'arbitre doit
   * répondre (écart ou question) avant que la vidéo continue.
   */
  const confront = useCallback(
    async (cardsFound: Found[]): Promise<boolean> => {
      const state = live.current;
      if (!state.layout) return false;
      for (const card of cardsFound) if (card.sure) counters.current.seen.add(codeOf(card.id));
      const seen = spotted(cardsFound, state.overrides, state.card);
      if (state.force) {
        // Partie déjà en cours : la première table lue fait foi.
        state.force = false;
        const reply = await call({ kind: "force", spotted: seen, layout: state.layout });
        const table = (reply.table ?? null) as EngineView | null;
        setView(table);
        await addEntry("forced", [t("journal.underway"), ...(reply.notes ?? [])], table);
        return false;
      }
      const reply = await call({ kind: "observe", spotted: seen, layout: state.layout });
      const table = (reply.table ?? null) as EngineView | null;
      setView(table);
      const outcome = reply.outcome;
      if (!outcome || reply.repeated) return false;
      switch (outcome.outcome) {
        case "unchanged":
          // La table est revenue à ce que le suivi attend : l'écart a été défait.
          closeOpen("repaired");
          return false;
        case "explained":
          closeOpen("repaired");
          await addEntry("explained", outcome.lines, table);
          return false;
        case "ambiguous": {
          closeOpen("superseded");
          const entry = await addEntry("question", [t("question.title", { count: outcome.options.length })], table);
          const opened = { entry: entry.id, time: entry.time, options: outcome.options };
          live.current.question = opened;
          setQuestion(opened);
          return true;
        }
        case "deviation": {
          closeOpen("superseded");
          const { kind, title, rule, reason } = outcome;
          const entry = await addEntry("deviation", outcome.seen, table, { deviation: { kind, title, rule, reason } });
          const opened = { entry: entry.id, time: entry.time, deviation: outcome };
          live.current.alert = opened;
          setAlert(opened);
          return true;
        }
      }
    },
    [addEntry, call, closeOpen, t],
  );

  async function start() {
    const element = video.current;
    if (!element || !layout || blocked) return;
    setStarting(true);
    setFailure(null);
    try {
      const config: EngineConfig = {
        mode: "duel",
        players: seats.map((seat, index) => ({ name: seatName(index), deck: seat.deck!.list! })),
        first_player: first,
        allow_unimplemented: true,
      };
      const seed = Math.floor(Math.random() * 2 ** 31);
      const reply = await call({ kind: "start", config, battlefields: battlefields as string[], seed });
      const range = cardRange(cardPx);
      await call({ kind: "card", min: range.card_min, max: range.card_max });
      setView((reply.table ?? null) as EngineView | null);
      setEntries([]);
      setOverrides([]);
      setAlert(null);
      setQuestion(null);
      setEnded(false);
      counters.current = { entry: 1, startedAt: performance.now(), moving: 0, manual: 0, seen: new Set() };
      live.current.force = underway;
      if (sourceKind === "file") element.pause();
      setPhase("live");
      setRunning(true);
    } catch (error) {
      console.error("Table filmée :", error);
      setFailure(t("error.start", { reason: error instanceof Error ? error.message : String(error) }));
    } finally {
      setStarting(false);
    }
  }

  // La boucle de lecture : une image, sa réponse, puis la suivante.
  useEffect(() => {
    if (phase !== "live" || !running) return;
    let stop = false;
    const isFile = sourceKind === "file";
    void (async () => {
      while (!stop) {
        const began = performance.now();
        const element = video.current;
        if (!element) return;
        if (isFile) {
          if (element.currentTime + STEP >= element.duration) {
            setRunning(false);
            setEnded(true);
            return;
          }
          await seek(element, element.currentTime + STEP);
          if (stop) return;
        }
        let frame: ImageBitmap;
        try {
          frame = await createImageBitmap(element);
        } catch {
          await wait(300);
          continue;
        }
        const reply = await call({ kind: "watch", frame });
        if (stop || !reply.glance) return;
        setFound(reply.glance.found);
        setGlance(reply.glance.state);
        setNow(clockNow());
        if (reply.glance.state === "moving") counters.current.moving += isFile ? STEP : Math.max(STEP, (performance.now() - began) / 1000);
        if (reply.glance.state === "read" && (await confront(reply.glance.found)) && isFile) {
          // La vidéo attend la réponse de l'arbitre.
          setRunning(false);
          return;
        }
        if (!isFile) await wait(Math.max(0, STEP * 1000 - (performance.now() - began)));
      }
    })().catch((error) => {
      if (!stop) fail(error);
    });
    return () => {
      stop = true;
    };
  }, [phase, running, sourceKind, call, confront, clockNow, fail]);

  /** Après une réponse de l'arbitre : la vidéo reprend. */
  function resume() {
    if (!ended) setRunning(true);
  }

  async function answer(act: () => Promise<void>) {
    setBusy(true);
    try {
      await act();
      resume();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const repaired = () =>
    answer(async () => {
      if (!alert) return;
      const reply = await call({ kind: "repaired" });
      const table = (reply.table ?? null) as EngineView | null;
      setView(table);
      resolve(alert.entry, "repaired");
      live.current.alert = null;
      setAlert(null);
      if (reply.explanation?.lines.length) await addEntry("explained", reply.explanation.lines, table);
    });

  const tableRight = () =>
    answer(async () => {
      const state = live.current;
      if (!state.layout) return;
      const reply = await call({ kind: "force", spotted: spotted(state.found, state.overrides, state.card), layout: state.layout });
      const table = (reply.table ?? null) as EngineView | null;
      setView(table);
      closeOpen("table");
      await addEntry("forced", [t("journal.tableRight"), ...(reply.notes ?? [])], table);
    });

  const choose = (index: number) =>
    answer(async () => {
      if (!question) return;
      const reply = await call({ kind: "choose", index });
      const table = (reply.table ?? null) as EngineView | null;
      setView(table);
      resolve(question.entry, "answered");
      live.current.question = null;
      setQuestion(null);
      if (reply.explanation) await addEntry("explained", reply.explanation.lines, table);
    });

  async function setPoints(seat: number, points: number) {
    try {
      const reply = await call({ kind: "points", seat, points });
      const table = (reply.table ?? null) as EngineView | null;
      setView(table);
      counters.current.manual += 1;
      await addEntry("score", [t("journal.scored", { name: seatName(seat), points })], table);
    } catch (error) {
      fail(error);
    }
  }

  function setFacedown(battlefield: number, seat: number, count: number) {
    if (!layout) return;
    const facedown = [0, 1].map((b) => [0, 1].map((s) => (b === battlefield && s === seat ? count : (layout.facedown[b]?.[s] ?? 0))));
    const next = { ...layout, facedown };
    setLayout(next);
    live.current.layout = next;
    counters.current.manual += 1;
    void confront(live.current.found).catch(fail);
  }

  function decide(card: Found, as: string | null) {
    const next = [...liveOverrides(found, overrides, cardPx), { at: card.at, card: as }];
    setOverrides(next);
    live.current.overrides = next;
    void confront(live.current.found).catch(fail);
  }

  function finish() {
    setRunning(false);
    setNow(clockNow());
    setTally({ moving: counters.current.moving, seen: counters.current.seen.size, manual: counters.current.manual });
    setPhase("report");
  }

  function download() {
    const text = exportJournal(entries, {
      game: "riftbound",
      players: seats.map((seat, index) => ({ name: seatName(index), deck: seat.deck?.name ?? null })),
      points: view?.points ?? [],
    });
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "table-filmee.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const doubts = useMemo(
    () =>
      phase === "live" && layout
        ? // Légendes et champs de bataille ne sont pas suivis : rien à confirmer.
          doubtful(found, overrides, layout, cardPx).filter((card) => {
            const kind = cards[codeOf(card.id)]?.kind;
            return kind !== "battlefield" && kind !== "legend";
          })
        : [],
    [phase, found, overrides, layout, cardPx, cards],
  );
  const deckCards = useMemo(() => {
    const codes = new Set<string>();
    for (const seat of seats) {
      const list = seat.deck?.list;
      if (list) [list.champion, ...list.main, ...list.runes].forEach((code) => codes.add(code));
    }
    return [...codes].sort((a, b) => cardName(a).localeCompare(cardName(b)));
  }, [seats, cardName]);
  const uncovered = useMemo(() => deckCards.filter((code) => cards[code] && !cards[code].playable).length, [deckCards, cards]);

  // --- L'affichage ----------------------------------------------------------

  if (!lobby) {
    return failure ? (
      <p className="rounded-xl border bg-card p-5 text-sm">{failure}</p>
    ) : (
      <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("loading")}
      </div>
    );
  }
  if (!lobby.signedIn) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <Button asChild>
          <Link href="/login">{tPlay("lobby.signIn")}</Link>
        </Button>
      </div>
    );
  }

  const report = phase === "report" && view;
  return (
    <div className="flex flex-col gap-4">
      {!report && (
        <header className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          {phase === "live" && view && (
            <span className="flex items-center gap-2 text-sm">
              {t("live.turn", { turn: view.turn })}
              <span className="size-2 rounded-full" style={{ background: SEAT_COLORS[view.turn_seat] }} />
              <strong>{seatName(view.turn_seat)}</strong>
            </span>
          )}
          <span className="grow" />
          {phase === "live" ? (
            <>
              <span className="flex items-center gap-2 text-sm">
                {glance === "moving" ? (
                  <Hand className="size-4 text-amber-400" aria-hidden />
                ) : (
                  <span className={cn("size-2 rounded-full", running ? "bg-emerald-400" : "bg-muted-foreground")} />
                )}
                {!running ? (ended ? t("live.ended") : t("live.paused")) : glance === "moving" ? t("live.moving") : t("live.stable")}
              </span>
              <span className="font-mono text-sm text-muted-foreground">{clock(now)}</span>
              {sourceKind === "file" && !ended && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRunning((current) => !current)}>
                  {running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  {running ? t("live.pause") : t("live.resume")}
                </Button>
              )}
              <Button type="button" size="sm" onClick={finish}>
                <Square className="size-4" aria-hidden />
                {t("live.finish")}
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{t("privacy")}</span>
          )}
        </header>
      )}

      {failure && (
        <p role="alert" className="rounded-xl border border-destructive/60 bg-destructive/10 p-3 text-sm">
          {failure}
        </p>
      )}
      {phase === "setup" && progress && seats.some((seat) => seat.learning) && (
        <p className="text-xs text-muted-foreground">{t("setup.learningProgress", { done: progress.done, total: progress.total })}</p>
      )}

      {report && (
        <FilmedReport
          entries={entries}
          view={view}
          end={now}
          moving={tally.moving}
          uncovered={uncovered}
          cardsSeen={tally.seen}
          manual={tally.manual}
          onBack={() => setPhase("live")}
          onExport={download}
          onReview={setReview}
          onNew={() => {
            setPhase("setup");
            setFound([]);
            setTrial(null);
          }}
        />
      )}

      <div
        className={cn(
          "grid items-start gap-4",
          phase === "setup" && "lg:grid-cols-[24rem_minmax(0,1fr)]",
          phase === "live" && "xl:grid-cols-[minmax(0,1fr)_27rem]",
          phase === "report" && "hidden",
        )}
      >
        {phase === "setup" && (
          <FilmedSetup
            decks={lobby.decks}
            cards={cards}
            seats={seats}
            onName={(seat, name) => patchSeat(seat, { name })}
            onDeck={(seat, deck) => void chooseDeck(seat, deck)}
            sideways={layout?.sideways ?? false}
            onSideways={turnSideways}
            sourceKind={sourceKind}
            onSourceKind={chooseSource}
            devices={devices}
            device={device}
            onDevice={setDevice}
            fileName={file?.name ?? null}
            onFile={chooseFile}
            sourceError={sourceError}
            sourceSize={size}
            reading={reading}
            onRead={() => void readTrial()}
            trial={trial}
            battlefields={battlefields}
            onBattlefield={(seat, code) => setBattlefields((current) => current.map((one, index) => (index === seat ? code : one)))}
            first={first}
            onFirst={setFirst}
            underway={underway}
            onUnderway={setUnderway}
            blocked={blocked}
            starting={starting}
            onStart={() => void start()}
          />
        )}

        <div className={cn("flex min-w-0 flex-col gap-4", phase === "setup" && "lg:sticky lg:top-4")}>
          <FilmedStage
            video={video}
            size={size}
            layout={layout}
            onLayout={phase === "setup" ? setLayout : undefined}
            found={found}
            showFrames={showFrames}
            showZones={phase === "setup" || showFrames}
            controls={phase === "setup" && sourceKind === "file"}
            cardName={cardName}
            areaLabel={areaLabel}
            empty={
              <span className="flex max-w-sm flex-col items-center gap-2 text-sm text-muted-foreground">
                {sourceKind === "camera" ? <Camera className="size-8" aria-hidden /> : <FileText className="size-8" aria-hidden />}
                {sourceError ?? (sourceKind === "camera" ? t("stage.waitingCamera") : t("stage.waitingFile"))}
              </span>
            }
          >
            {size && (
              <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-row flex-wrap items-start gap-2 text-xs">
                <span className="rounded-lg bg-black/60 px-2.5 py-1">
                  {sourceKind === "camera" ? t("stage.camera") : (file?.name ?? "")} · {size.width} × {size.height}
                </span>
                <span className="grow" />
                {phase === "live" && (
                  <button
                    type="button"
                    aria-pressed={showFrames}
                    className="pointer-events-auto rounded-lg bg-black/60 px-2.5 py-1"
                    onClick={() => setShowFrames((current) => !current)}
                  >
                    {t("stage.frames")}
                  </button>
                )}
              </div>
            )}
            {size && phase === "live" && showFrames && (
              <div className="pointer-events-none absolute right-3 bottom-3 flex flex-row flex-wrap gap-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs">
                {[0, 1].map((seat) => (
                  <span key={seat} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: SEAT_COLORS[seat] }} />
                    {seatName(seat)}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border border-dashed border-amber-400" />
                  {t("stage.toConfirm")}
                </span>
              </div>
            )}
            {reading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
                <span className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("setup.reading")}
                </span>
              </div>
            )}
          </FilmedStage>
          {phase === "live" && view && <TablePanel view={view} onCorrect={() => setCorrecting(true)} />}
        </div>

        {phase === "live" && view && (
          <aside className="flex min-w-0 flex-col gap-4">
            {alert && (
              <AlertCard
                deviation={alert.deviation}
                time={alert.time}
                busy={busy}
                onRepaired={() => void repaired()}
                onTable={() => void tableRight()}
                onReview={(() => {
                  const entry = entries.find((one) => one.id === alert.entry);
                  return entry?.shot ? () => setReview(entry) : null;
                })()}
              />
            )}
            {question && <QuestionCard options={question.options} time={question.time} busy={busy} onAnswer={(index) => void choose(index)} />}
            {doubts.length > 0 && (
              <DoubtCard
                video={video}
                card={doubts[0]}
                remaining={doubts.length - 1}
                cardName={cardName}
                deckCards={deckCards}
                onDecide={(as) => decide(doubts[0], as)}
              />
            )}
            {ended && (
              <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm">
                <strong>{t("live.endedTitle")}</strong>
                <Button type="button" size="sm" className="self-start" onClick={finish}>
                  {t("live.finish")}
                </Button>
              </section>
            )}
            <Journal
              entries={entries}
              turn={view.turn}
              seatName={seatName}
              onNote={(text) => void addEntry("note", [text], view)}
              onScore={() => setCorrecting(true)}
              onReview={setReview}
            />
          </aside>
        )}
      </div>

      {view && layout && (
        <CorrectDialog
          open={correcting}
          onOpenChange={setCorrecting}
          view={view}
          facedown={layout.facedown}
          busy={busy}
          onPoints={(seat, points) => void setPoints(seat, points)}
          onFacedown={setFacedown}
          onTable={() => {
            setCorrecting(false);
            void tableRight();
          }}
        />
      )}

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{review?.deviation?.title ?? t("review.title")}</DialogTitle>
            <DialogDescription>
              {review ? t("report.at", { turn: review.turn, time: clock(review.time) }) : ""}
            </DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {review?.shot && <img src={review.shot} alt="" className="w-full rounded-lg" />}
          {review?.lines.map((line, index) => (
            <p key={index} className="text-sm">
              {line}
            </p>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
