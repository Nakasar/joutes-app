"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Fuse from "fuse.js";
import type { Worker as TesseractWorker } from "tesseract.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CameraOff, Loader2, ScanLine } from "lucide-react";

type CardNameEntry = { id: string; name: string };

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

type Phase = "idle" | "loading-names" | "starting" | "scanning" | "matched" | "error";

const SCAN_INTERVAL_MS = 700;
const MATCH_SCORE_THRESHOLD = 0.45;
const MIN_LINE_LENGTH = 3;
// Fraction of the captured frame kept, centered — matches the on-screen guide
// box so OCR only sees the card, not whatever background surrounds it.
const CROP_RATIO = 0.82;
// Simple contrast boost applied after grayscale conversion; text edges on
// busy card art come through much cleaner for Tesseract with this than raw color.
const CONTRAST = 1.5;

export default function ScannerClient({ gameSlug }: { gameSlug: string }) {
  const t = useTranslations("Games.Scanner");

  const [phase, setPhase] = useState<Phase>("loading-names");
  const [error, setError] = useState<string | null>(null);
  const [matchedCard, setMatchedCard] = useState<MatchedCard | null>(null);
  const [lastReadText, setLastReadText] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<TesseractWorker | null>(null);
  const fuseRef = useRef<Fuse<CardNameEntry> | null>(null);
  const stopRef = useRef(true);

  const stopCamera = useCallback(() => {
    stopRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNames() {
      try {
        const res = await fetch(`/api/games/${gameSlug}/scanner/names`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error?.message ?? t("errors.namesLoad"));
        }
        const names: CardNameEntry[] = data.names ?? [];
        fuseRef.current = new Fuse(names, {
          keys: ["name"],
          threshold: MATCH_SCORE_THRESHOLD,
          ignoreLocation: true,
          minMatchCharLength: MIN_LINE_LENGTH,
        });
        setPhase("idle");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("errors.namesLoad"));
        setPhase("error");
      }
    }

    void loadNames();

    return () => {
      cancelled = true;
    };
  }, [gameSlug, t]);

  useEffect(() => {
    return () => {
      stopCamera();
      void workerRef.current?.terminate();
    };
  }, [stopCamera]);

  const findBestMatch = useCallback((text: string): CardNameEntry | null => {
    const fuse = fuseRef.current;
    if (!fuse) return null;

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= MIN_LINE_LENGTH);

    let best: { item: CardNameEntry; score: number } | null = null;
    for (const line of lines) {
      const [top] = fuse.search(line);
      if (top && top.score !== undefined && (!best || top.score < best.score)) {
        best = { item: top.item, score: top.score };
      }
    }

    return best ? best.item : null;
  }, []);

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

  // Crops to the centered guide-box region and converts to high-contrast
  // grayscale in place — both steps measurably improve Tesseract's accuracy
  // on stylized card-name text sitting on top of busy artwork.
  const prepareCapture = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean => {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (!videoWidth || !videoHeight) return false;

    const cropWidth = Math.round(videoWidth * CROP_RATIO);
    const cropHeight = Math.round(videoHeight * CROP_RATIO);
    const cropX = Math.round((videoWidth - cropWidth) / 2);
    const cropY = Math.round((videoHeight - cropHeight) / 2);

    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const imageData = ctx.getImageData(0, 0, cropWidth, cropHeight);
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
      setLastReadText(text.replace(/\s+/g, " ").trim());
      const match = findBestMatch(text);
      if (match && !stopRef.current) {
        stopCamera();
        await fetchCardDetails(match.id);
      }
    } catch (err) {
      console.error("Scanner OCR error", err);
    }
  }, [prepareCapture, findBestMatch, fetchCardDetails, stopCamera]);

  const scanLoop = useCallback(async () => {
    while (!stopRef.current) {
      await captureAndRecognize();
      if (stopRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
    }
  }, [captureAndRecognize]);

  // Attaches the camera stream and starts OCR only once the <video> element
  // for the "scanning" phase has actually been mounted by React — requesting
  // the stream and flipping the phase happen in startScanning(), but if the
  // browser already has camera permission, getUserMedia() can resolve before
  // React commits that render, so attaching the stream from inside
  // startScanning() itself would silently miss the (not-yet-mounted) video
  // element and leave OCR reading a 0x0 frame forever.
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
        if (cancelled) return;

        if (!workerRef.current) {
          const { createWorker, PSM } = await import("tesseract.js");
          const newWorker = await createWorker("eng");
          await newWorker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
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
  }, [phase, scanLoop, t]);

  const startScanning = useCallback(async () => {
    setError(null);
    setMatchedCard(null);
    setLastReadText("");
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
  }, [t]);

  const handleScanAgain = useCallback(() => {
    setMatchedCard(null);
    void startScanning();
  }, [startScanning]);

  const handleCancel = useCallback(() => {
    stopCamera();
    setPhase("idle");
  }, [stopCamera]);

  return (
    <div className="space-y-6">
      {phase === "loading-names" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("starting")}</span>
        </div>
      )}

      {phase === "idle" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <ScanLine className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">{t("instructions")}</p>
            <Button onClick={() => void startScanning()}>{t("start")}</Button>
          </CardContent>
        </Card>
      )}

      {phase === "error" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CameraOff className="h-10 w-10 text-destructive" />
            <p className="max-w-md text-sm text-destructive">{error}</p>
            <Button onClick={() => void startScanning()}>{t("start")}</Button>
          </CardContent>
        </Card>
      )}

      {(phase === "starting" || phase === "scanning") && (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] max-w-sm overflow-hidden rounded-lg border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{phase === "starting" ? t("starting") : t("scanning")}</span>
          </div>
          {phase === "scanning" && lastReadText && (
            <p className="mx-auto max-w-sm truncate text-center text-xs text-muted-foreground">
              {t("lastRead", { text: lastReadText })}
            </p>
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
