"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { SwuTable } from "@/components/play/swu/SwuTable";
import { readSwuSave, useSwuSoloGame, writeSwuSave, type SwuSave } from "@/components/play/swu/useSwuSoloGame";
import { useSwuTableCards } from "@/components/play/swu/useSwuTableCards";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Une partie de Star Wars: Unlimited contre l'IA, ou entre IA regardée en
 * spectateur : gardée dans le navigateur, reprise là où elle en était.
 */
export function SwuSoloGame() {
  const t = useTranslations("Games.Play");
  const cards = useSwuTableCards();
  // `undefined` : pas encore lu (le stockage n'existe que dans le navigateur).
  const [save, setSave] = useState<SwuSave | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage après le montage, pour ne pas diverger du rendu serveur
    setSave(readSwuSave());
  }, []);

  const feed = useSwuSoloGame(save ?? null, cards);

  if (save === undefined) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  if (save === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("solo.none")}</p>
        <Button asChild>
          <Link href="/games/swu/play">{t("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  const replay = () => {
    // Mêmes decks, nouvelle graine : une autre partie.
    const next: SwuSave = {
      ...save,
      record: { ...save.record, seed: Math.floor(Math.random() * 2 ** 31) + 1, actions: [] },
    };
    writeSwuSave(next);
    setSave(next);
  };

  const after = (
    <div className="flex flex-row flex-wrap justify-center gap-2">
      <Button onClick={replay}>{t("result.replay")}</Button>
      <Button variant="outline" asChild>
        <Link href="/games/swu/play" onClick={() => writeSwuSave(null)}>
          {t("result.toLobby")}
        </Link>
      </Button>
    </div>
  );

  // Une partie gardée que le moteur ne sait plus rouvrir (il a changé depuis).
  if (feed.status === "error" && !feed.update) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("solo.broken")}</p>
        {after}
      </div>
    );
  }

  return <SwuTable feed={feed} cards={cards} afterResult={after} />;
}
