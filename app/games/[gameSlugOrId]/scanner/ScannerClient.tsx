"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Fuse from "fuse.js";
import type { Worker as TesseractWorker } from "tesseract.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { CameraOff, Loader2, ScanLine, Sparkles } from "lucide-react";

type CardMatch = { id: string; name: string; score: number };
type CardNameEntry = { id: string; name: string };
type AiIdentification = {
  cardName: string | null;
  game: string | null;
  collectorNumber: string | null;
  setCode: string | null;
  lang: string | null;
};

type ErrataDetails = {
  id: string;
  type: "errata" | "clarification" | "ruling";
  details: string;
  errataDate: string;
  source?: string;
  deprecatedAt?: string;
};

type MatchedCard = {
  id: string;
  name: string;
  image: string;
  setCode: string;
  collectorNumber: string;
  text?: string;
  banned?: boolean;
  erratas: ErrataDetails[];
};

type Phase = "idle" | "starting" | "scanning" | "ai-processing" | "matched" | "error";
type Mode = "ocr" | "ai";

const SCAN_INTERVAL_MS = 700;
const MIN_TEXT_LENGTH = 3;
const MATCH_SCORE_THRESHOLD = 0.4;
// After this many consecutive match-request failures, stop scanning instead
// of retrying forever every SCAN_INTERVAL_MS against a backend that's down.
const MAX_CONSECUTIVE_MATCH_ERRORS = 3;
// Fraction of the captured frame kept, centered — matches the on-screen guide
// box so the card crop only sees the card, not whatever background surrounds it.
const CROP_RATIO = 0.82;
// The name is printed in a horizontal band near the top on virtually every
// trading card layout. OCR-ing (and matching against) only that band —
// instead of the whole card — is what keeps rules text, flavor text, and
// artwork noise from ever being fuzzy-matched against the card-name index.
const NAME_BAND_TOP_MARGIN_RATIO = 0.03;
const NAME_BAND_HEIGHT_RATIO = 0.2;
const NAME_BAND_SIDE_MARGIN_RATIO = 0.06;
// Simple contrast boost applied after grayscale conversion; text edges on
// busy card art come through much cleaner for Tesseract with this than raw color.
const CONTRAST = 1.5;

export default function ScannerClient({
  gameSlug,
  canUseAiScan = false,
}: {
  gameSlug: string;
  canUseAiScan?: boolean;
}) {
  const t = useTranslations("Games.Scanner");
  const tGames = useTranslations("Games");

  const getLanguageLabel = useCallback(
    (language: string) => {
      const translationKey = `cards.collection.languages.${language.toLowerCase()}`;
      const translated = tGames(translationKey);
      return translated === translationKey ? language.toUpperCase() : translated;
    },
    [tGames]
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("ocr");
  const [error, setError] = useState<string | null>(null);
  const [matchedCard, setMatchedCard] = useState<MatchedCard | null>(null);
  const [lastReadText, setLastReadText] = useState("");
  const [aiIdentification, setAiIdentification] = useState<AiIdentification | null>(null);
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedSetCode, setSelectedSetCode] = useState("");
  const [selectedLang, setSelectedLang] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<TesseractWorker | null>(null);
  const stopRef = useRef(true);
  const lastSentTextRef = useRef("");
  const consecutiveMatchErrorsRef = useRef(0);
  // Only set once a set is selected: matching then runs against this
  // in-memory index instead of calling the server on every scan tick.
  const fuseRef = useRef<Fuse<CardNameEntry> | null>(null);

  const stopCamera = useCallback(() => {
    stopRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      void workerRef.current?.terminate();
    };
  }, [stopCamera]);

  // Populates the set/language comboboxes. Reuses the cards search endpoint
  // (limit=1) purely for the setCodes/languages it already computes for the
  // whole game, instead of adding a near-duplicate lookup.
  useEffect(() => {
    let cancelled = false;

    async function loadFilterOptions() {
      try {
        const res = await fetch(`/api/games/${gameSlug}/cards?page=1&limit=1`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setSetCodes(data.setCodes ?? []);
        setLanguages(data.languages ?? []);
      } catch (err) {
        if (!cancelled) console.error("Scanner filter options load error", err);
      }
    }

    void loadFilterOptions();

    return () => {
      cancelled = true;
    };
  }, [gameSlug]);

  // A set is small enough (unlike a game's full card list) to ship to the
  // client and fuzzy-match locally, with zero backend calls per scan tick.
  useEffect(() => {
    if (!selectedSetCode) {
      fuseRef.current = null;
      return;
    }

    let cancelled = false;

    async function loadSetNames() {
      try {
        const params = new URLSearchParams({ setCode: selectedSetCode });
        if (selectedLang) {
          params.set("lang", selectedLang);
        }
        const res = await fetch(`/api/games/${gameSlug}/scanner/names?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error?.message ?? t("errors.generic"));
        }
        const names: CardNameEntry[] = data.names ?? [];
        fuseRef.current = new Fuse(names, {
          keys: ["name"],
          threshold: MATCH_SCORE_THRESHOLD,
          ignoreLocation: true,
          minMatchCharLength: MIN_TEXT_LENGTH,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Scanner set names load error", err);
        fuseRef.current = null;
      }
    }

    void loadSetNames();

    return () => {
      cancelled = true;
    };
  }, [gameSlug, selectedSetCode, selectedLang, t]);

  // When a set is selected, matching runs locally against its in-memory Fuse
  // index. Otherwise it falls back to the server-side Meilisearch match —
  // narrowed to the selected language if one is set — since shipping a
  // game's entire card list (or even just one language's worth) to the
  // client to build a local index doesn't scale.
  const matchCardText = useCallback(
    async (text: string): Promise<CardMatch | null> => {
      const fuse = fuseRef.current;
      if (fuse) {
        // OCR is already restricted to the name band, so the text is a
        // single candidate — no need to search line by line.
        const [top] = fuse.search(text);
        return top && top.score !== undefined ? { ...top.item, score: top.score } : null;
      }

      const res = await fetch(`/api/games/${gameSlug}/scanner/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: selectedLang || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? t("errors.generic"));
      }
      return data.match ?? null;
    },
    [gameSlug, selectedLang, t]
  );

  const fetchCardDetails = useCallback(
    async (cardId: string) => {
      try {
        const res = await fetch(`/api/games/${gameSlug}/cards/${cardId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? t("errors.cardFetch"));
        }
        setMatchedCard(data as MatchedCard);
        setPhase("matched");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.cardFetch"));
        setPhase("error");
      }
    },
    [gameSlug, t]
  );

  // Crops to the name band within the centered guide-box region (see
  // NAME_BAND_* constants) and converts to high-contrast grayscale in
  // place — both steps measurably improve Tesseract's accuracy and keep it
  // from ever reading rules text, flavor text, or artwork noise.
  const prepareCapture = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean => {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (!videoWidth || !videoHeight) return false;

    const cardWidth = Math.round(videoWidth * CROP_RATIO);
    const cardHeight = Math.round(videoHeight * CROP_RATIO);
    const cardX = Math.round((videoWidth - cardWidth) / 2);
    const cardY = Math.round((videoHeight - cardHeight) / 2);

    const bandWidth = Math.round(cardWidth * (1 - 2 * NAME_BAND_SIDE_MARGIN_RATIO));
    const bandHeight = Math.round(cardHeight * NAME_BAND_HEIGHT_RATIO);
    const bandX = cardX + Math.round(cardWidth * NAME_BAND_SIDE_MARGIN_RATIO);
    const bandY = cardY + Math.round(cardHeight * NAME_BAND_TOP_MARGIN_RATIO);

    canvas.width = bandWidth;
    canvas.height = bandHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.drawImage(video, bandX, bandY, bandWidth, bandHeight, 0, 0, bandWidth, bandHeight);

    const imageData = ctx.getImageData(0, 0, bandWidth, bandHeight);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const adjusted = Math.min(255, Math.max(0, (gray - 128) * CONTRAST + 128));
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ctx.putImageData(imageData, 0, 0);

    return true;
  }, []);

  const captureAndRecognize = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !worker || video.readyState < 2) return;
    if (!prepareCapture(video, canvas)) return;

    try {
      const result = await worker.recognize(canvas);
      const text = result.data.text || "";
      const normalizedText = text.replace(/\s+/g, " ").trim();
      setLastReadText(normalizedText);

      // Skip the request entirely if this frame read the same text as the
      // last one we actually sent — a static or blurry frame would otherwise
      // hit the match endpoint every SCAN_INTERVAL_MS for no new information.
      if (normalizedText.length < MIN_TEXT_LENGTH || normalizedText === lastSentTextRef.current) {
        return;
      }
      lastSentTextRef.current = normalizedText;

      const match = await matchCardText(normalizedText);
      consecutiveMatchErrorsRef.current = 0;
      if (match && !stopRef.current) {
        stopCamera();
        await fetchCardDetails(match.id);
      }
    } catch (err) {
      console.error("Scanner OCR error", err);
      consecutiveMatchErrorsRef.current += 1;
      if (consecutiveMatchErrorsRef.current >= MAX_CONSECUTIVE_MATCH_ERRORS) {
        stopCamera();
        setError(t("errors.generic"));
        setPhase("error");
      }
    }
  }, [prepareCapture, matchCardText, fetchCardDetails, stopCamera, t]);

  const scanLoop = useCallback(async () => {
    while (!stopRef.current) {
      await captureAndRecognize();
      if (stopRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
    }
  }, [captureAndRecognize]);

  // Attaches the camera stream once the <video> element for the "scanning"
  // phase has actually been mounted by React — requesting the stream and
  // flipping the phase happen in startCapture(), but if the browser already
  // has camera permission, getUserMedia() can resolve before React commits
  // that render, so attaching the stream from inside startCapture() itself
  // would silently miss the (not-yet-mounted) video element and leave the
  // feed reading a 0x0 frame forever. The OCR loop only starts on top of
  // that for "ocr" mode — "ai" mode just shows the live feed and waits for
  // the capture button.
  useEffect(() => {
    if (phase !== "scanning") return;

    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    video.srcObject = stream;

    async function start(videoEl: HTMLVideoElement) {
      try {
        await videoEl.play();
        if (cancelled || mode !== "ocr") return;

        if (!workerRef.current) {
          const { createWorker, PSM } = await import("tesseract.js");
          const newWorker = await createWorker("eng");
          // The capture is now cropped to a single-line name band rather
          // than the whole card, so tell Tesseract to expect one line.
          await newWorker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
          workerRef.current = newWorker;
        }
        if (cancelled) return;

        stopRef.current = false;
        void scanLoop();
      } catch (err) {
        if (cancelled) return;
        console.error("Scanner start error", err);
        setError(t("errors.cameraAccess"));
        setPhase("error");
      }
    }

    void start(video);

    return () => {
      cancelled = true;
    };
  }, [phase, mode, scanLoop, t]);

  const startCapture = useCallback(
    async (nextMode: Mode) => {
      setMode(nextMode);
      setError(null);
      setMatchedCard(null);
      setLastReadText("");
      setAiIdentification(null);
      lastSentTextRef.current = "";
      consecutiveMatchErrorsRef.current = 0;
      setPhase("starting");

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("errors.cameraUnsupported"));
        setPhase("error");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        streamRef.current = stream;
        setPhase("scanning");
      } catch (err) {
        console.error("Scanner camera error", err);
        setError(t("errors.cameraAccess"));
        setPhase("error");
      }
    },
    [t]
  );

  const startScanning = useCallback(() => startCapture("ocr"), [startCapture]);
  const startAiScan = useCallback(() => startCapture("ai"), [startCapture]);

  // Captures the full-color card crop (not the grayscale, name-band-only
  // crop used for OCR) — the AI model benefits from seeing the whole card,
  // not just its name.
  const captureCardImageDataUrl = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const cardWidth = Math.round(video.videoWidth * CROP_RATIO);
    const cardHeight = Math.round(video.videoHeight * CROP_RATIO);
    const cardX = Math.round((video.videoWidth - cardWidth) / 2);
    const cardY = Math.round((video.videoHeight - cardHeight) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = cardWidth;
    canvas.height = cardHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, cardX, cardY, cardWidth, cardHeight, 0, 0, cardWidth, cardHeight);

    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const handleCaptureAiPhoto = useCallback(async () => {
    const imageDataUrl = captureCardImageDataUrl();
    if (!imageDataUrl) {
      setError(t("errors.generic"));
      setPhase("error");
      return;
    }

    stopCamera();
    setPhase("ai-processing");

    try {
      const res = await fetch(`/api/games/${gameSlug}/scanner/ai-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? t("errors.generic"));
      }

      setAiIdentification(data.identification ?? null);
      if (data.match) {
        await fetchCardDetails(data.match.id);
      } else {
        setError(t("errors.aiNoMatch"));
        setPhase("error");
      }
    } catch (err) {
      console.error("Scanner AI match error", err);
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setPhase("error");
    }
  }, [captureCardImageDataUrl, stopCamera, gameSlug, fetchCardDetails, t]);

  const handleScanAgain = useCallback(() => {
    setMatchedCard(null);
    void startCapture(mode);
  }, [startCapture, mode]);

  const handleCancel = useCallback(() => {
    stopCamera();
    setPhase("idle");
  }, [stopCamera]);

  const setOptions: ComboboxOption[] = [
    { value: "", label: t("filters.setPlaceholder") },
    ...setCodes.map((setCode) => ({ value: setCode, label: setCode })),
  ];
  const langOptions: ComboboxOption[] = [
    { value: "", label: t("filters.langPlaceholder") },
    ...languages.map((language) => ({ value: language, label: getLanguageLabel(language) })),
  ];
  const canEditFilters = phase === "idle" || phase === "error";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 py-6 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">{t("filters.setLabel")}</label>
            <Combobox
              options={setOptions}
              value={selectedSetCode}
              onChange={setSelectedSetCode}
              placeholder={t("filters.setPlaceholder")}
              searchPlaceholder={t("filters.setSearchPlaceholder")}
              emptyMessage={t("filters.setEmpty")}
              disabled={!canEditFilters}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">{t("filters.langLabel")}</label>
            <Combobox
              options={langOptions}
              value={selectedLang}
              onChange={setSelectedLang}
              placeholder={t("filters.langPlaceholder")}
              searchPlaceholder={t("filters.langSearchPlaceholder")}
              emptyMessage={t("filters.langEmpty")}
              disabled={!canEditFilters}
            />
          </div>
        </CardContent>
      </Card>

      {phase === "idle" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <ScanLine className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">{t("instructions")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => void startScanning()}>{t("start")}</Button>
              {canUseAiScan && (
                <Button variant="secondary" onClick={() => void startAiScan()}>
                  <Sparkles className="h-4 w-4" />
                  {t("aiStart")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "error" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CameraOff className="h-10 w-10 text-destructive" />
            <p className="max-w-md text-sm text-destructive">{error}</p>
            {aiIdentification && (
              <p className="max-w-md text-xs text-muted-foreground">
                {t("aiIdentificationLabel")}{" "}
                {[
                  aiIdentification.cardName,
                  aiIdentification.game,
                  aiIdentification.setCode,
                  aiIdentification.collectorNumber,
                  aiIdentification.lang,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("aiIdentificationEmpty")}
              </p>
            )}
            <Button onClick={() => void startCapture(mode)}>{t("start")}</Button>
          </CardContent>
        </Card>
      )}

      {phase === "ai-processing" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">{t("aiProcessing")}</p>
          </CardContent>
        </Card>
      )}

      {(phase === "starting" || phase === "scanning") && (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] max-w-sm overflow-hidden rounded-lg border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70">
              {mode === "ocr" && (
                <div
                  className="pointer-events-none absolute rounded border-2 border-dashed border-yellow-400"
                  style={{
                    top: `${NAME_BAND_TOP_MARGIN_RATIO * 100}%`,
                    left: `${NAME_BAND_SIDE_MARGIN_RATIO * 100}%`,
                    width: `${(1 - 2 * NAME_BAND_SIDE_MARGIN_RATIO) * 100}%`,
                    height: `${NAME_BAND_HEIGHT_RATIO * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          {mode === "ocr" && (
            <>
              <div className="mx-auto max-w-sm space-y-1">
                <p className="text-center text-xs font-medium text-muted-foreground">{t("ocrPreviewLabel")}</p>
                <canvas ref={canvasRef} className="mx-auto h-auto w-full rounded border bg-black" />
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{phase === "starting" ? t("starting") : t("scanning")}</span>
              </div>
              {phase === "scanning" && lastReadText && (
                <p className="mx-auto max-w-sm truncate text-center text-xs text-muted-foreground">
                  {t("lastRead", { text: lastReadText })}
                </p>
              )}
            </>
          )}

          {mode === "ai" && (
            <div className="flex flex-col items-center gap-3">
              {phase === "starting" ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("starting")}</span>
                </div>
              ) : (
                <Button onClick={() => void handleCaptureAiPhoto()}>
                  <Sparkles className="h-4 w-4" />
                  {t("aiCapture")}
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-center">
            <Button variant="outline" onClick={handleCancel}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {phase === "matched" && matchedCard && (
        <Card>
          <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row">
            {matchedCard.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={matchedCard.image}
                alt={matchedCard.name}
                className="mx-auto w-48 shrink-0 rounded-lg shadow-lg sm:mx-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold">{matchedCard.name}</h2>
                {matchedCard.banned && <Badge variant="destructive">{t("card.banned")}</Badge>}
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {matchedCard.setCode} #{matchedCard.collectorNumber}
              </p>
              {matchedCard.text && (
                <p className="mb-4 whitespace-pre-wrap text-sm">{matchedCard.text}</p>
              )}
              {matchedCard.erratas.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("card.noErrata")}</p>
              ) : (
                <div className="space-y-2">
                  {matchedCard.erratas.map((errata) => (
                    <div key={errata.id} className={`border-t pt-2 ${errata.deprecatedAt ? "opacity-50" : ""}`}>
                      <p className="text-sm">{errata.details}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6">
                <Button onClick={handleScanAgain}>{t("scanAgain")}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
