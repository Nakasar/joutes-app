"use client";

import { useTranslations } from "next-intl";

import { useRemoteUrl } from "@/components/play/RemoteGame";
import { SwuTable } from "@/components/play/swu/SwuTable";
import { useSwuOnlineGame } from "@/components/play/swu/useSwuOnlineGame";
import { useSwuTableCards } from "@/components/play/swu/useSwuTableCards";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Une partie de Star Wars: Unlimited hébergée par quelqu'un d'autre (mode
 * hôte). Comme pour Riftbound, le lien d'invitation porte l'adresse du serveur
 * et le ticket dans son fragment, qui n'est jamais envoyé à Joutes.
 */
export function SwuRemoteGame() {
  const t = useTranslations("Games.Play");
  const cards = useSwuTableCards();
  const url = useRemoteUrl();
  const feed = useSwuOnlineGame(url ?? null, cards);

  if (url === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("remote.badLink")}</p>
        <Button asChild>
          <Link href="/games/swu/play">{t("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  if (feed.status === "error" && !feed.update) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center">
        <p>{t("remote.unreachable")}</p>
        <p className="text-sm text-muted-foreground">{t("remote.unreachableHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Les noms et le récit de cette table viennent de ce serveur, pas de Joutes : on dit lequel. */}
      {url && <p className="text-xs text-muted-foreground">{t("remote.server", { host: new URL(url).host })}</p>}
      <SwuTable
        feed={feed}
        cards={cards}
        afterResult={
          <div className="flex flex-row flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/games/swu/play">{t("result.toLobby")}</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
