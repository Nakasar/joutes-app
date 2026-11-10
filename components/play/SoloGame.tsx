"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { GameTable } from "@/components/play/GameTable";
import { readSoloSave, useSoloGame, writeSoloSave, type SoloSave } from "@/components/play/useSoloGame";
import { useTableCards } from "@/components/play/useTableCards";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Une partie contre l'IA : la partie gardée dans le navigateur, reprise là où elle en était. */
export function SoloGame() {
  const t = useTranslations("Games.Play");
  const cards = useTableCards();
  // `undefined` : pas encore lu (le stockage n'existe que dans le navigateur).
  const [save, setSave] = useState<SoloSave | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage après le montage, pour ne pas diverger du rendu serveur
    setSave(readSoloSave());
  }, []);

  const feed = useSoloGame(save ?? null);

  if (save === undefined) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  if (save === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("solo.none")}</p>
        <Button asChild>
          <Link href="/games/riftbound/play">{t("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  const replay = () => {
    // Même configuration, nouvelle graine : une autre partie avec les mêmes decks.
    const next: SoloSave = {
      ...save,
      record: { ...save.record, seed: Math.floor(Math.random() * 2 ** 31) + 1, actions: [] },
    };
    writeSoloSave(next);
    setSave(next);
  };

  return (
    <GameTable
      feed={feed}
      cards={cards}
      afterResult={
        <div className="flex flex-row flex-wrap gap-2">
          <Button onClick={replay}>{t("result.replay")}</Button>
          <Button variant="outline" asChild>
            <Link href="/games/riftbound/play" onClick={() => writeSoloSave(null)}>
              {t("result.toLobby")}
            </Link>
          </Button>
        </div>
      }
    />
  );
}
