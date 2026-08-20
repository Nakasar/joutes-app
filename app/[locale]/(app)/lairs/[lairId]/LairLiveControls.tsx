"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Radio, Square } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { isSupportedLiveUrl } from "@/lib/lairs/live.ts";

import { setLairLiveStream, stopLairLiveStream, type LairLiveError } from "./live-actions.ts";

/** Les échecs de l'action serveur, traduits ici — elle ne renvoie que des codes. */
const ERROR_KEYS: Record<LairLiveError, string> = {
  INVALID_URL: "errors.invalidUrl",
  NOT_FOUND: "errors.notFound",
  FAILED: "errors.failed",
};

/**
 * Les commandes du direct, réservées au staff du lieu.
 *
 * L'URL est vérifiée ici avant l'envoi, non pour se substituer au contrôle du
 * serveur — qui refait le même — mais pour que la faute se voie sans
 * aller-retour : coller un lien Facebook dans ce champ est l'erreur la plus
 * probable, et elle mérite mieux qu'un rechargement pour l'apprendre.
 */
export default function LairLiveControls({
  lairId,
  isLive,
  currentUrl,
}: {
  lairId: string;
  isLive: boolean;
  currentUrl?: string;
}) {
  const t = useTranslations("Lairs.portal.live");
  const [isEditing, setIsEditing] = useState(!isLive);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [url, setUrl] = useState(currentUrl ?? "");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const value = url.trim();

    if (!isSupportedLiveUrl(value)) {
      toast.error(t("errors.invalidUrl"));
      return;
    }

    startTransition(async () => {
      const result = await setLairLiveStream(lairId, value);

      if (result.success) {
        toast.success(t("started"));
        setIsEditing(false);
      } else {
        toast.error(t(ERROR_KEYS[result.error]));
      }
    });
  };

  const stop = () => {
    startTransition(async () => {
      const result = await stopLairLiveStream(lairId);

      if (result.success) {
        toast.success(t("stopped"));
        setUrl("");
        setIsConfirmingStop(false);
        setIsEditing(true);
      } else {
        toast.error(t(ERROR_KEYS[result.error]));
      }
    });
  };

  if (isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t("urlPlaceholder")}
          aria-label={t("urlLabel")}
          className="h-9 w-60 font-mono text-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={isPending}
          className="bg-[var(--lair-accent)] text-[var(--lair-accent-foreground)] hover:bg-[var(--lair-accent)]/90"
        >
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Radio className="mr-2 h-4 w-4" aria-hidden />
          )}
          {isLive ? t("save") : t("goLive")}
        </Button>
        {isLive && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
            {t("cancel")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
        <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
        {t("editUrl")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => setIsConfirmingStop(true)}
        className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
      >
        <Square className="mr-2 h-3.5 w-3.5" aria-hidden />
        {t("stopLive")}
      </Button>
      <ConfirmDialog
        open={isConfirmingStop}
        onOpenChange={setIsConfirmingStop}
        title={t("stopConfirmTitle")}
        description={t("stopConfirmDescription")}
        confirmLabel={t("stopLive")}
        cancelLabel={t("cancel")}
        destructive
        busy={isPending}
        onConfirm={stop}
      />
    </div>
  );
}
