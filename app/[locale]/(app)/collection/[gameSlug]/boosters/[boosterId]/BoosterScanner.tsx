"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Worker as TesseractWorker } from "tesseract.js";
import { CameraOff, Flashlight, FlashlightOff, Loader2, Plus, Sparkles, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import CardImage from "@/components/cards/CardImage.tsx";
import { CARD_ASPECT, captureCardImageDataUrl, cardGuide, drawCard } from "@/lib/scanner-frame.ts";
import { createNameMatcher, normalizeCollectorNumber, pickScannedCard, readCollectorNumbers } from "@/lib/scanner-booster.ts";
import type { ScannerSetCard } from "@/lib/db/cards.ts";

const SCAN_INTERVAL_MS = 500;
// La carte entière est lue : au-delà, Tesseract ralentit sans lire mieux.
const OCR_MAX_WIDTH = 900;
// Images sans nom reconnu avant de considérer que la carte a quitté le cadre :
// la même carte peut alors être ajoutée à nouveau (deux exemplaires d'une
// commune dans le même booster). Un reflet ou un flou fait rater une image ou
// deux sans que la carte ait bougé.
const FRAMES_BEFORE_CARD_LEFT = 3;
// Lectures consécutives du même nom avant d'ajouter la carte : une lecture qui
// hésite entre deux noms sur la même carte n'ajoute ni l'un ni l'autre.
const FRAMES_TO_CONFIRM = 2;
// Lectures du même nom sans numéro départageant ses variantes avant de
// demander au joueur de choisir.
const FRAMES_BEFORE_DOUBT = 3;
const FRAME = { cardAspect: CARD_ASPECT } as const;

type Phase = "loading" | "scanning" | "doubt" | "ai" | "error";
type Added = { entryId: string; card: ScannerSetCard; foil: boolean };

type Props = {
  gameSlug: string;
  setCode: string;
  lang: string;
  canUseAiScan: boolean;
  /** Le foil reste choisi d'une carte à l'autre, et d'un scan à l'autre. */
  foil: boolean;
  onFoilChange: (foil: boolean) => void;
  boosterCardCount: number;
  /**
   * Ajoute la carte au booster. `entryId` permet de l'annuler ; il peut manquer
   * alors que l'ajout a réussi.
   */
  onAdd: (card: ScannerSetCard, foil: boolean) => Promise<{ ok: boolean; entryId?: string }>;
  /** Retire l'exemplaire du booster ; `false` s'il y est resté. */
  onUndo: (entryId: string) => Promise<boolean>;
  onSearchByName: (name: string) => void;
  onClose: () => void;
};

/**
 * Scan des cartes d'un booster à la caméra : chaque carte reconnue est ajoutée
 * aussitôt, une à la suite de l'autre, et la dernière peut être annulée.
 *
 * Le booster dit son extension : la reconnaissance ne compare le texte lu
 * qu'aux noms de cette extension, en mémoire, ce qui la rend à la fois fiable
 * et gratuite. L'identification par IA ne sert qu'en repli.
 */
export default function BoosterScanner({
  gameSlug,
  setCode,
  lang,
  canUseAiScan,
  foil,
  onFoilChange,
  boosterCardCount,
  onAdd,
  onUndo,
  onSearchByName,
  onClose,
}: Props) {
  const t = useTranslations("Collection.boosters.scanner");

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cards, setCards] = useState<ScannerSetCard[] | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [lastRead, setLastRead] = useState("");
  const [added, setAdded] = useState<Added[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [doubt, setDoubt] = useState<{ name: string; candidates: ScannerSetCard[] } | null>(null);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<TesseractWorker | null>(null);
  const foilRef = useRef(foil);
  foilRef.current = foil;
  // L'écran d'édition se redessine à chaque ajout : la boucle de lecture ne
  // doit pas repartir pour autant.
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  // État de la boucle de lecture, hors React : elle tourne entre deux rendus.
  const lastAddedNameRef = useRef<string | null>(null);
  const missesRef = useRef(0);
  const stableRef = useRef<{ name: string; count: number }>({ name: "", count: 0 });
  const doubtRef = useRef<{ name: string; count: number }>({ name: "", count: 0 });

  const byName = useMemo(() => {
    const map = new Map<string, ScannerSetCard[]>();
    for (const card of cards ?? []) {
      const key = card.name.toLowerCase();
      map.set(key, [...(map.get(key) ?? []), card]);
    }
    return map;
  }, [cards]);
  const matchName = useMemo(
    () => createNameMatcher([...new Map((cards ?? []).map((card) => [card.name.toLowerCase(), card.name])).values()]),
    [cards],
  );

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  // Le défilement de la page derrière l'écran de scan ne servirait qu'à le décaler.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Cartes de l'extension, caméra et moteur de lecture se préparent ensemble.
  useEffect(() => {
    let cancelled = false;

    async function loadCards() {
      try {
        const params = new URLSearchParams({ setCode });
        if (lang) params.set("lang", lang);
        const res = await fetch(`/api/games/${gameSlug}/scanner/set-cards?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message);
        if (!cancelled) setCards(data.cards ?? []);
      } catch (err) {
        console.error("Booster scanner cards load error", err);
        if (!cancelled) fail(t("errors.cards"));
      }
    }

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        fail(t("errors.cameraUnsupported"));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const [track] = stream.getVideoTracks();
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorch({ supported: Boolean(capabilities?.torch), on: false });
        setStreamReady(true);
      } catch (err) {
        console.error("Booster scanner camera error", err);
        if (!cancelled) fail(t("errors.cameraAccess"));
      }
    }

    async function startWorker() {
      try {
        const { createWorker, PSM } = await import("tesseract.js");
        const worker = await createWorker("eng");
        // Le nom n'est pas au même endroit d'un jeu à l'autre : toute la
        // carte est lue, comme du texte épars.
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        if (cancelled) {
          void worker.terminate();
          return;
        }
        workerRef.current = worker;
        setWorkerReady(true);
      } catch (err) {
        console.error("Booster scanner OCR start error", err);
        if (!cancelled) fail(t("errors.generic"));
      }
    }

    void loadCards();
    void startCamera();
    void startWorker();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [gameSlug, setCode, lang, fail, t]);

  // The <video> only exists once React has rendered it: the stream is
  // attached here rather than right after getUserMedia() resolves.
  useEffect(() => {
    const video = videoRef.current;
    if (!streamReady || !video || !streamRef.current || video.srcObject === streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch((err) => console.error("Booster scanner video play error", err));
  }, [streamReady, phase]);

  useEffect(() => {
    if (phase === "loading" && cards && streamReady && workerReady) {
      setPhase(cards.length > 0 ? "scanning" : "error");
      if (cards.length === 0) setError(t("noCards", { setCode }));
    }
  }, [phase, cards, streamReady, workerReady, setCode, t]);

  // Taille affichée de la vidéo, pour poser le cadre de visée exactement sur la
  // zone lue.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      setBoxSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [streamReady]);

  const addCard = useCallback(
    async (card: ScannerSetCard) => {
      // Posé avant l'ajout : la boucle continue de lire la même carte pendant
      // que la requête part.
      lastAddedNameRef.current = card.name.toLowerCase();
      doubtRef.current = { name: "", count: 0 };
      setNotice(null);
      const { ok, entryId } = await onAddRef.current(card, foilRef.current);
      if (!ok) {
        lastAddedNameRef.current = null;
        setNotice(t("errors.add"));
      } else if (entryId) {
        // Une carte toujours foil l'est quel que soit le bouton (cf. `resolvePrinting`).
        setAdded((prev) => [...prev, { entryId, card, foil: card.foil === true || foilRef.current }]);
      }
    },
    [t],
  );

  const handleText = useCallback(
    async (text: string) => {
      const hit = matchName(text);
      if (!hit) {
        missesRef.current += 1;
        if (missesRef.current >= FRAMES_BEFORE_CARD_LEFT) lastAddedNameRef.current = null;
        stableRef.current = { name: "", count: 0 };
        setLastRead("");
        return;
      }
      missesRef.current = 0;
      setLastRead(hit.name);

      const key = hit.name.toLowerCase();
      const stable = stableRef.current.name === key ? stableRef.current.count + 1 : 1;
      stableRef.current = { name: key, count: stable };
      if (stable < FRAMES_TO_CONFIRM || key === lastAddedNameRef.current) return;

      const candidates = byName.get(key) ?? [];
      const card = pickScannedCard(candidates, readCollectorNumbers(text, setCode));
      if (card) {
        await addCard(card);
        return;
      }

      const count = doubtRef.current.name === key ? doubtRef.current.count + 1 : 1;
      doubtRef.current = { name: key, count };
      if (count >= FRAMES_BEFORE_DOUBT) {
        setDoubt({ name: hit.name, candidates });
        setPhase("doubt");
      }
    },
    [matchName, byName, setCode, addCard],
  );

  useEffect(() => {
    if (phase !== "scanning") return;
    let stopped = false;

    async function loop() {
      while (!stopped) {
        const video = videoRef.current;
        const worker = workerRef.current;
        canvasRef.current ??= document.createElement("canvas");
        if (video && worker && video.readyState >= 2 && drawCard(video, canvasRef.current, { ...FRAME, maxWidth: OCR_MAX_WIDTH })) {
          try {
            const result = await worker.recognize(canvasRef.current);
            if (stopped) break;
            await handleText(result.data.text ?? "");
          } catch (err) {
            console.error("Booster scanner OCR error", err);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
      }
    }

    void loop();
    return () => {
      stopped = true;
    };
  }, [phase, handleText]);

  const pickCandidate = async (card: ScannerSetCard) => {
    setDoubt(null);
    setPhase("scanning");
    await addCard(card);
  };

  const resume = () => {
    setDoubt(null);
    setNotice(null);
    doubtRef.current = { name: "", count: 0 };
    setPhase("scanning");
  };

  const identifyWithAi = async () => {
    const video = videoRef.current;
    const image = video ? captureCardImageDataUrl(video, FRAME) : null;
    if (!image) return;
    const previous = phase;
    setPhase("ai");
    setNotice(null);
    try {
      const res = await fetch(`/api/games/${gameSlug}/scanner/ai-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message);
      // L'IA peut renvoyer la carte dans une autre langue que celle gardée
      // pour l'extension : faute d'identifiant identique, son nom et son
      // numéro la retrouvent.
      const name = typeof data.match?.name === "string" ? data.match.name : "";
      const sameName = byName.get(name.toLowerCase()) ?? [];
      const number = data.identification?.collectorNumber;
      const card =
        (cards ?? []).find((c) => c.id === data.match?.id) ??
        pickScannedCard(
          sameName,
          typeof number === "string" ? [...readCollectorNumbers(number, setCode), normalizeCollectorNumber(number)] : [],
        );
      if (card) {
        setDoubt(null);
        setPhase("scanning");
        await addCard(card);
        return;
      }
      if (sameName.length > 1) {
        setDoubt({ name, candidates: sameName });
        setPhase("doubt");
        return;
      }
      setNotice(t("aiNoMatch"));
    } catch (err) {
      console.error("Booster scanner AI error", err);
      setNotice(t("errors.generic"));
    }
    setPhase(previous === "doubt" ? "doubt" : "scanning");
  };

  const undoLast = async () => {
    const last = added.at(-1);
    if (!last) return;
    setUndoing(true);
    try {
      if (await onUndo(last.entryId)) {
        setAdded((prev) => prev.filter((entry) => entry.entryId !== last.entryId));
      } else {
        setNotice(t("errors.undo"));
      }
    } finally {
      setUndoing(false);
    }
  };

  const toggleTorch = async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  // Rectangle affiché de la vidéo (`object-contain`) puis cadre de la carte dedans.
  const guideStyle = useMemo(() => {
    if (!videoSize.width || !boxSize.width) return null;
    const videoAspect = videoSize.width / videoSize.height;
    const width = Math.min(boxSize.width, boxSize.height * videoAspect);
    const height = width / videoAspect;
    const guide = cardGuide(videoSize.width, videoSize.height, FRAME);
    return {
      left: (boxSize.width - width) / 2 + guide.left * width,
      top: (boxSize.height - height) / 2 + guide.top * height,
      width: guide.width * width,
      height: guide.height * height,
    };
  }, [videoSize, boxSize]);

  const last = added.at(-1);
  const showCamera = phase !== "error";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title", { setCode })}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className="text-sm font-semibold">{t("title", { setCode })}</span>
          <span className="truncate text-xs text-white/70">{t("subtitle")}</span>
        </div>
        {torch.supported ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            aria-label={torch.on ? t("torchOff") : t("torchOn")}
            aria-pressed={torch.on}
            onClick={toggleTorch}
          >
            {torch.on ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
          </Button>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </header>

      <div ref={boxRef} className="relative min-h-0 flex-1 bg-neutral-950">
        {showCamera && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-contain"
              muted
              playsInline
              onLoadedMetadata={(e) =>
                setVideoSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })
              }
              // Le téléphone qu'on tourne échange largeur et hauteur de l'image.
              onResize={(e) =>
                setVideoSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })
              }
            />
            {guideStyle && (
              <div
                className={`pointer-events-none absolute rounded-xl border-2 ${
                  phase === "doubt" ? "border-amber-400" : "border-white/85"
                }`}
                style={guideStyle}
              />
            )}
          </>
        )}

        {phase === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/80">
            <Loader2 className="size-8 animate-spin" />
            {t("loading")}
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <CameraOff className="size-10 text-red-400" />
            <p className="max-w-sm text-sm">{error}</p>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
        )}

        {phase === "scanning" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-4">
            <div className="flex max-w-full items-center gap-2 rounded-full bg-black/75 px-3 py-2 text-sm">
              <Loader2 className="size-4 shrink-0 animate-spin text-sky-400" />
              <span className="truncate">{lastRead ? t("reading", { name: lastRead }) : t("aim")}</span>
            </div>
          </div>
        )}

        {phase === "ai" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-sm">
            <Loader2 className="size-8 animate-spin" />
            {t("aiProcessing")}
          </div>
        )}
      </div>

      {phase === "doubt" && doubt ? (
        <div className="max-h-[60%] space-y-3 overflow-y-auto rounded-t-2xl border-t border-white/10 bg-background p-4 text-foreground">
          <div>
            <h2 className="text-base font-semibold">{t("doubtTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("doubtDescription", { name: doubt.name })}</p>
          </div>
          <ul className="space-y-2">
            {doubt.candidates.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border bg-card p-2 text-left hover:bg-accent"
                  onClick={() => void pickCandidate(card)}
                  aria-label={t("addCandidate", { name: card.name, number: card.collectorNumber })}
                >
                  <CardImage src={card.image} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{card.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {card.setCode}-{card.collectorNumber}
                      {card.rarity ? ` · ${card.rarity}` : ""}
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0 text-primary" />
                </button>
              </li>
            ))}
          </ul>
          {notice && <p className="text-sm text-destructive">{notice}</p>}
          {canUseAiScan && (
            <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => void identifyWithAi()}>
              <Sparkles className="size-4" />
              {t("aiIdentify")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={resume}>
              {t("resume")}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => onSearchByName(doubt.name)}>
              {t("searchByName")}
            </Button>
          </div>
        </div>
      ) : (
        phase !== "error" && (
          <div className="space-y-3 border-t border-white/10 bg-background p-4 text-foreground">
            {last && (
              <div
                className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2"
                aria-live="polite"
              >
                <CardImage src={last.card.image} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t("added", { name: last.card.name })}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("addedDetail", {
                      code: `${last.card.setCode}-${last.card.collectorNumber}${last.foil ? ` · ${t("foil")}` : ""}`,
                      count: added.length,
                    })}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-11" onClick={undoLast} disabled={undoing}>
                  {undoing ? <Loader2 className="size-4 animate-spin" /> : t("undo")}
                </Button>
              </div>
            )}
            {notice && <p className="text-sm text-destructive">{notice}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={foil ? "default" : "outline"}
                className="h-11 gap-2"
                aria-pressed={foil}
                onClick={() => onFoilChange(!foil)}
              >
                <Star className={`size-4 ${foil ? "fill-current" : ""}`} />
                {t("foil")}
              </Button>
              {canUseAiScan && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-2"
                  onClick={() => void identifyWithAi()}
                  disabled={phase !== "scanning"}
                >
                  <Sparkles className="size-4" />
                  {t("aiShort")}
                </Button>
              )}
              <Button type="button" className="ml-auto h-11" onClick={onClose}>
                {t("done")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("count", { count: boosterCardCount })}</p>
          </div>
        )
      )}
    </div>
  );
}
