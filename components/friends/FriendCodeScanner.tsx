"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CameraOff, Loader2, ScanLine, UserCheck } from "lucide-react";
import { extractFriendCodeFromScan } from "@/lib/utils/friend-codes";

type PublicUser = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
};

function displayNameFor(user: PublicUser): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

type Phase = "idle" | "starting" | "scanning" | "adding" | "success" | "error";

const SCAN_INTERVAL_MS = 300;

export default function FriendCodeScanner({ onFriendAdded }: { onFriendAdded?: () => void }) {
  const t = useTranslations("Friends.scan");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [friend, setFriend] = useState<PublicUser | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
    return () => stopCamera();
  }, [stopCamera]);

  const addFriendByCode = useCallback(
    async (code: string) => {
      setPhase("adding");
      try {
        const response = await fetch("/api/friends/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await response.json();

        if (!response.ok && response.status !== 409) {
          throw new Error(data.error || t("errors.generic"));
        }

        setFriend(data.friend || null);
        setPhase("success");
        onFriendAdded?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.generic"));
        setPhase("error");
      }
    },
    [onFriendAdded, t]
  );

  const scanLoop = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    while (!stopRef.current) {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height);

        if (result) {
          const code = extractFriendCodeFromScan(result.data);
          if (code) {
            stopCamera();
            await addFriendByCode(code);
            return;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
    }
  }, [addFriendByCode, stopCamera]);

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
        stopRef.current = false;
        void scanLoop();
      } catch (err) {
        if (cancelled) return;
        console.error("Friend code scanner start error", err);
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
    setFriend(null);
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
      console.error("Friend code scanner camera error", err);
      setError(t("errors.cameraAccess"));
      setPhase("error");
    }
  }, [t]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      stopCamera();
      setPhase("idle");
      setError(null);
      setFriend(null);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ScanLine className="mr-2 h-4 w-4" />
        {t("button")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("instructions")}</DialogDescription>
          </DialogHeader>

          {(phase === "idle" || phase === "starting") && (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <ScanLine className="h-10 w-10 text-muted-foreground" />
                <Button onClick={() => void startScanning()} disabled={phase === "starting"}>
                  {phase === "starting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("start")}
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "scanning" && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={videoRef} className="w-full" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <Button variant="outline" className="w-full" onClick={() => handleOpenChange(false)}>
                {t("cancel")}
              </Button>
            </div>
          )}

          {phase === "adding" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("adding")}</p>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <UserCheck className="h-10 w-10 text-primary" />
              <p className="font-medium">
                {friend ? t("success", { name: displayNameFor(friend) }) : t("successGeneric")}
              </p>
              <Button variant="outline" onClick={() => void startScanning()}>
                {t("scanAgain")}
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={() => void startScanning()}>{t("start")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
