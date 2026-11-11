"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { GameTable } from "@/components/play/GameTable";
import { useOnlineGame } from "@/components/play/useOnlineGame";
import { useTableCards } from "@/components/play/useTableCards";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** L'adresse WebSocket d'une partie hébergée, à partir de l'adresse du serveur et d'un ticket. */
export function remoteSocketUrl(server: string, ticket: string): string | null {
  try {
    const body = JSON.parse(atob(ticket.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))) as { game?: unknown };
    if (typeof body.game !== "string") return null;
    const base = new URL(server);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    const path = base.pathname.replace(/\/+$/, "");
    return `${base.origin}${path}/games/${encodeURIComponent(body.game)}/ws?ticket=${encodeURIComponent(ticket)}`;
  } catch {
    return null;
  }
}

/**
 * Une partie hébergée par quelqu'un d'autre (mode hôte). Le lien d'invitation
 * porte l'adresse du serveur et le ticket dans son fragment (`#…`), qui n'est
 * jamais envoyé à Joutes.
 */
export function RemoteGame() {
  const t = useTranslations("Games.Play");
  const cards = useTableCards();
  // `undefined` : fragment pas encore lu.
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const server = params.get("server");
      const ticket = params.get("ticket");
      setUrl(server && ticket ? remoteSocketUrl(server, ticket) : null);
    };
    // Le fragment n'existe que dans le navigateur ; coller une autre invitation
    // dans le même onglet ne recharge pas la page.
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const feed = useOnlineGame(url ?? null);

  if (url === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("remote.badLink")}</p>
        <Button asChild>
          <Link href="/games/riftbound/play">{t("solo.toLobby")}</Link>
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
      <GameTable
        feed={feed}
        cards={cards}
        // Les noms et le récit de cette table viennent de ce serveur, pas de Joutes : on dit lequel.
        note={url ? t("remote.server", { host: new URL(url).host }) : undefined}
        afterResult={
          <div className="flex flex-row flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/games/riftbound/play">{t("result.toLobby")}</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
