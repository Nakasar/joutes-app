"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Radio, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

import { declarePlayGroupLive, removePlayGroupLive, type PlayGroupActionResult } from "./actions.ts";

/**
 * Déclarer son direct, ou retirer celui d'un autre.
 *
 * Le champ n'accepte que Twitch et YouTube — les deux seules plateformes dont
 * on sait construire un lecteur intégré. Le refus vient du serveur : coller un
 * lien Facebook doit dire *pourquoi* il ne passe pas, pas disparaître en
 * silence.
 */
export default function PlayGroupLiveControls({
  playGroupId,
  liveId,
  currentUrl,
  currentTitle,
}: {
  playGroupId: string;
  liveId?: string;
  currentUrl?: string;
  currentTitle?: string;
}) {
  const t = useTranslations("PlayGroups.hub.live");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(currentUrl ?? "");
  const [title, setTitle] = useState(currentTitle ?? "");

  const report = (result: PlayGroupActionResult) => {
    if (result.success) {
      setOpen(false);
      return;
    }

    toast.error(t(result.error === "INVALID_URL" ? "invalidUrl" : result.error === "TOO_MANY_LIVES" ? "tooMany" : "error"));
  };

  const onDeclare = () => {
    startTransition(async () => {
      report(await declarePlayGroupLive(playGroupId, { url, title }));
    });
  };

  if (liveId) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            report(await removePlayGroupLive(playGroupId, liveId));
          })
        }
      >
        <X aria-hidden />
        {t("remove")}
      </Button>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Radio aria-hidden />
        {t("declare")}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={t("urlPlaceholder")}
        aria-label={t("urlLabel")}
        className="sm:max-w-xs"
      />
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titleLabel")}
        className="sm:max-w-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || url.trim().length === 0} onClick={onDeclare}>
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
