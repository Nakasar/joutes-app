"use client";

import { useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LimitedKind, LimitedSettings } from "@/lib/engine/limited";
import { BOT_LEVELS, type BotLevel } from "@/lib/engine/types";
import type { LimitedTimers } from "@/lib/types/LimitedEvent";

type GuestSeat = { kind: "guest" | "bot"; name: string; level: BotLevel };

type Invitation = { name: string; link: string; own: boolean };

const MAX_GUESTS = 7;

/**
 * Mode hôte d'un scellé ou d'un draft : l'évènement tourne sur un serveur de
 * parties lancé par quelqu'un (`joutes-server host`). Cette page lui envoie les
 * réglages, obtient un ticket par joueur et donne un lien d'invitation à
 * chacun. Le serveur ouvre les boosters : ni cette page ni Joutes ne les voient.
 */
export function LimitedHostPanel({
  kind,
  packs,
  hostName,
  timers,
  children,
}: {
  kind: LimitedKind;
  /** L'extension de chaque booster, choisie plus haut dans la page. */
  packs: string[];
  hostName: string;
  timers: LimitedTimers;
  /** Le réglage des délais, tenu par la page. */
  children: ReactNode;
}) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const [server, setServer] = useState("http://localhost:7777");
  const [token, setToken] = useState("");
  const [guests, setGuests] = useState<GuestSeat[]>([{ kind: "guest", name: "", level: "normal" }]);
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);

  const setRow = (index: number, patch: Partial<GuestSeat>) =>
    setGuests(guests.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  const create = async () => {
    setBusy(true);
    try {
      const base = server.trim().replace(/\/+$/, "");
      const taken = new Set([hostName]);
      const players: LimitedSettings["players"] = [{ name: hostName, bot: null }];
      for (const [index, row] of guests.entries()) {
        const wanted =
          row.name.trim() ||
          (row.kind === "bot"
            ? tPlay("lobby.botName", { number: index + 1 })
            : tPlay("host.guestName", { number: index + 1 }));
        // Deux sièges du même nom ne se distingueraient pas autour de la table.
        let name = wanted;
        for (let number = 2; taken.has(name); number++) name = `${wanted} ${number}`;
        taken.add(name);
        players.push({ name, bot: row.kind === "bot" ? row.level : null });
      }

      const headers = { "content-type": "application/json", authorization: `Bearer ${token.trim()}` };
      const settings: LimitedSettings = { kind, packs, players };
      const created = await fetch(`${base}/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({ game: "riftbound", settings, timers }),
      });
      const event = (await created.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!created.ok || !event?.id) throw new Error(event?.error ?? tPlay("host.refused", { status: created.status }));

      const ticket = async (body: object): Promise<string> => {
        const response = await fetch(`${base}/events/${event.id}/tickets`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const json = (await response.json().catch(() => null)) as { ticket?: string; error?: string } | null;
        if (!response.ok || !json?.ticket) {
          throw new Error(json?.error ?? tPlay("host.refused", { status: response.status }));
        }
        return json.ticket;
      };
      const linkOf = (value: string) =>
        `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/limited/remote#server=${encodeURIComponent(base)}&ticket=${encodeURIComponent(value)}`;

      const list: Invitation[] = [];
      for (const [seat, player] of players.entries()) {
        if (player.bot) continue;
        list.push({
          name: player.name,
          link: linkOf(await ticket({ role: "player", seat, name: player.name })),
          own: seat === 0,
        });
      }
      list.push({
        name: tPlay("host.spectators"),
        link: linkOf(await ticket({ role: "spectator", name: tPlay("host.spectator") })),
        own: false,
      });
      setInvitations(list);
    } catch (error) {
      // `fetch` échoue sans détail quand le serveur est injoignable ou que le
      // navigateur refuse une adresse non chiffrée depuis une page https.
      toast.error(
        error instanceof TypeError ? tPlay("host.unreachable") : error instanceof Error ? error.message : String(error),
      );
    }
    setBusy(false);
  };

  if (invitations) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("host.created")}</p>
        <ul className="flex flex-col gap-2">
          {invitations.map((invitation) => (
            <li key={invitation.link} className="flex flex-row flex-wrap items-center gap-2 rounded-lg border p-2">
              <span className="font-medium">{invitation.name}</span>
              <div className="ml-auto flex flex-row flex-wrap gap-2">
                {invitation.own && (
                  <Button asChild size="sm">
                    <a href={invitation.link}>{t("host.open")}</a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(invitation.link).then(() => toast.success(tPlay("room.copied")));
                  }}
                >
                  <Copy aria-hidden />
                  {tPlay("room.copy")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-row flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setInvitations(null)}>
            {t("host.another")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("host.intro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="limited-host-server">{tPlay("host.server")}</Label>
          <Input id="limited-host-server" value={server} onChange={(event) => setServer(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="limited-host-token">{tPlay("host.token")}</Label>
          <Input
            id="limited-host-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {guests.map((row, index) => (
          <li key={index} className="flex flex-row flex-wrap items-center gap-2 rounded-lg border p-3">
            <span className="text-sm font-medium">{tPlay("host.seat", { number: index + 2 })}</span>
            <Button
              size="sm"
              variant={row.kind === "guest" ? "default" : "outline"}
              aria-pressed={row.kind === "guest"}
              onClick={() => setRow(index, { kind: "guest" })}
            >
              {tPlay("host.guest")}
            </Button>
            <Button
              size="sm"
              variant={row.kind === "bot" ? "default" : "outline"}
              aria-pressed={row.kind === "bot"}
              onClick={() => setRow(index, { kind: "bot" })}
            >
              {tPlay("lobby.ai")}
            </Button>
            {row.kind === "guest" ? (
              <Input
                aria-label={tPlay("host.guestNameLabel")}
                placeholder={tPlay("host.guestNameLabel")}
                value={row.name}
                maxLength={40}
                onChange={(event) => setRow(index, { name: event.target.value })}
                className="max-w-52"
              />
            ) : (
              BOT_LEVELS.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={row.level === value ? "secondary" : "outline"}
                  aria-pressed={row.level === value}
                  onClick={() => setRow(index, { level: value })}
                >
                  {tPlay(`level.${value}`)}
                </Button>
              ))
            )}
            {guests.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setGuests(guests.filter((_, position) => position !== index))}
              >
                {tPlay("room.remove")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {guests.length < MAX_GUESTS && (
        <div className="flex flex-row flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGuests([...guests, { kind: "guest", name: "", level: "normal" }])}
          >
            {t("host.addSeat")}
          </Button>
        </div>
      )}

      {children}

      <div className="flex flex-row flex-wrap gap-2">
        <Button disabled={busy || !server.trim() || !token.trim()} onClick={create}>
          {t("setup.create")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{tPlay("host.tls")}</p>
    </div>
  );
}
