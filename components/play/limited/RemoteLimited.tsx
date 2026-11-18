"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { OnlineLimited } from "@/components/play/limited/OnlineLimited";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Remote = { url: string; server: string; key: string; host: string };

/**
 * L'évènement que désigne un lien d'invitation : l'adresse du serveur et un
 * ticket dont le champ `game` vaut `event:<identifiant>`.
 */
export function remoteLimited(server: string, ticket: string): Remote | null {
  try {
    const body = JSON.parse(atob(ticket.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))) as {
      game?: unknown;
      seat?: unknown;
    };
    if (typeof body.game !== "string" || !body.game.startsWith("event:")) return null;
    const event = body.game.slice("event:".length);
    const base = new URL(server);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    const root = `${base.origin}${base.pathname.replace(/\/+$/, "")}`;
    return {
      url: `${root}/events/${encodeURIComponent(event)}/ws?ticket=${encodeURIComponent(ticket)}`,
      server: root,
      key: `${base.host}.${event}.${typeof body.seat === "number" ? body.seat : "watch"}`,
      host: base.host,
    };
  } catch {
    return null;
  }
}

/**
 * Un scellé ou un draft hébergé par quelqu'un d'autre (mode hôte). Le lien
 * d'invitation porte l'adresse du serveur et le ticket dans son fragment
 * (`#…`), qui n'est jamais envoyé à Joutes.
 */
export function RemoteLimited() {
  const tPlay = useTranslations("Games.Play");
  // `undefined` tant que le fragment n'est pas lu, `null` s'il est incomplet.
  const [remote, setRemote] = useState<Remote | null | undefined>(undefined);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const server = params.get("server");
      const ticket = params.get("ticket");
      setRemote(server && ticket ? remoteLimited(server, ticket) : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (remote === undefined) return null;
  if (remote === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{tPlay("remote.badLink")}</p>
        <Button asChild>
          <Link href="/games/riftbound/play">{tPlay("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Les noms et les cartes de cet évènement viennent de ce serveur, pas de Joutes : on dit lequel. */}
      <p className="text-xs text-muted-foreground">{tPlay("remote.server", { host: remote.host })}</p>
      <OnlineLimited
        key={remote.url}
        url={remote.url}
        server={remote.server}
        storageKey={remote.key}
        note={tPlay("remote.server", { host: remote.host })}
      />
    </div>
  );
}
