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
const MATCH_SCORE_THRESHOLD = 0.4;
const MIN_LINE_LENGTH = 3;

export default function ScannerClient({ gameSlug }: { gameSlug: string }) {
  const t = useTranslations("Games.Scanner");

  const [phase, setPhase] = useState<Phase>("loading-names");
  const [error, setError] = useState<string | null>(null);
  const [matchedCard, setMatchedCard] = useState<MatchedCard | null>(null);

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

  const captureAndRecognize = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !worker || video.readyState < 2) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    try {
      const result = await worker.recognize(canvas);
      const match = findBestMatch(result.data.text || "");
      if (match && !stopRef.current) {
        stopCamera();
        await fetchCardDetails(match.id);
      }
    } catch (err) {
      console.error("Scanner OCR error", err);
    }
  }, [findBestMatch, fetchCardDetails, stopCamera]);

  const scanLoop = useCallback(async () => {
    while (!stopRef.current) {
      await captureAndRecognize();
      if (stopRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
    }
  }, [captureAndRecognize]);

  const startScanning = useCallback(async () => {
    setError(null);
    setMatchedCard(null);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (!workerRef.current) {
        const { createWorker } = await import("tesseract.js");
        workerRef.current = await createWorker("eng");
      }

      stopRef.current = false;
      setPhase("scanning");
      void scanLoop();
    } catch (err) {
      console.error("Scanner camera error", err);
      setError(t("errors.cameraAccess"));
      setPhase("error");
    }
  }, [scanLoop, t]);

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
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {phase === "starting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("starting")}</span>
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("scanning")}</span>
              </>
            )}
          </div>
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
