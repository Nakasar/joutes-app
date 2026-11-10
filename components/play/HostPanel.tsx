"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { resolveDeckAction } from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadEngine } from "@/lib/engine/browser";
import { BOT_LEVELS, modePlayers, type BotLevel, type EngineDeckList, type EngineMode } from "@/lib/engine/types";

type GuestSeat = { kind: "guest" | "bot"; name: string; deck: string; level: BotLevel };

type Invitation = { name: string; link: string; own: boolean };

type HostPanelProps = {
  mode: EngineMode;
  hostName: string;
  /** Le deck choisi plus haut dans la page, ou `null` s'il n'y en a pas. */
  hostDeck: () => Promise<EngineDeckList | null>;
  legends: string[];
};

function seed(): number {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

/**
 * Mode hôte : la partie tourne sur un serveur de parties lancé par quelqu'un
 * (l'organisateur d'un tournoi, par exemple). Cette page lui envoie la
 * configuration, obtient un ticket par joueur et donne un lien d'invitation à
 * chacun. Joutes ne voit ni l'adresse du serveur ni son code.
 */
export function HostPanel({ mode, hostName, hostDeck, legends }: HostPanelProps) {
  const t = useTranslations("Games.Play");
  const seats = modePlayers(mode) - 1;
  const [server, setServer] = useState("http://localhost:7777");
  const [token, setToken] = useState("");
  const [guests, setGuests] = useState<GuestSeat[]>([]);
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);

  // Le nombre de sièges suit le mode choisi plus haut.
  const rows: GuestSeat[] = Array.from(
    { length: seats },
    (_, index) => guests[index] ?? { kind: "guest", name: "", deck: "", level: "normal" },
  );
  const setRow = (index: number, patch: Partial<GuestSeat>) =>
    setGuests(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  const create = async () => {
    setBusy(true);
    try {
      const base = server.trim().replace(/\/+$/, "");
      const engine = await loadEngine();
      const auto = () => {
        const deck = JSON.parse(
          engine.auto_deck(legends[Math.floor(Math.random() * legends.length)], seed()),
        ) as EngineDeckList | null;
        if (!deck) throw new Error(t("error.SERVER"));
        return deck;
      };

      const mine = await hostDeck();
      if (!mine) throw new Error(t("host.needDeck"));
      const players = [{ name: hostName, deck: mine }];
      const bots: (BotLevel | null)[] = [null];
      for (const [index, row] of rows.entries()) {
        const name =
          row.name.trim() ||
          (row.kind === "bot" ? t("lobby.botName", { number: index + 1 }) : t("host.guestName", { number: index + 1 }));
        let deck: EngineDeckList;
        if (row.kind === "guest" && row.deck.trim()) {
          const resolved = await resolveDeckAction(row.deck.trim());
          if (!resolved.ok) {
            throw new Error(`${name} : ${t(`error.${resolved.error}`)} ${(resolved.details ?? []).join(" ")}`);
          }
          deck = resolved.list;
        } else {
          deck = auto();
        }
        players.push({ name, deck });
        bots.push(row.kind === "bot" ? row.level : null);
      }

      const headers = { "content-type": "application/json", authorization: `Bearer ${token.trim()}` };
      const created = await fetch(`${base}/games`, {
        method: "POST",
        headers,
        body: JSON.stringify({ config: { mode, players }, bots }),
      });
      const game = (await created.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!created.ok || !game?.id) throw new Error(game?.error ?? t("host.refused", { status: created.status }));

      const ticket = async (body: object): Promise<string> => {
        const response = await fetch(`${base}/games/${game.id}/tickets`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const json = (await response.json().catch(() => null)) as { ticket?: string; error?: string } | null;
        if (!response.ok || !json?.ticket) throw new Error(json?.error ?? t("host.refused", { status: response.status }));
        return json.ticket;
      };
      const linkOf = (value: string) =>
        `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/remote#server=${encodeURIComponent(base)}&ticket=${encodeURIComponent(value)}`;

      const list: Invitation[] = [];
      for (const [seat, player] of players.entries()) {
        if (bots[seat]) continue;
        list.push({
          name: player.name,
          link: linkOf(await ticket({ role: "player", seat, name: player.name })),
          own: seat === 0,
        });
      }
      list.push({
        name: t("host.spectators"),
        link: linkOf(await ticket({ role: "spectator", name: t("host.spectator") })),
        own: false,
      });
      setInvitations(list);
    } catch (error) {
      // `fetch` échoue sans détail quand le serveur est injoignable ou que le
      // navigateur refuse une adresse non chiffrée depuis une page https.
      toast.error(error instanceof TypeError ? t("host.unreachable") : error instanceof Error ? error.message : String(error));
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
                    void navigator.clipboard.writeText(invitation.link).then(() => toast.success(t("room.copied")));
                  }}
                >
                  <Copy aria-hidden />
                  {t("room.copy")}
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
          <Label htmlFor="host-server">{t("host.server")}</Label>
          <Input id="host-server" value={server} onChange={(event) => setServer(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="host-token">{t("host.token")}</Label>
          <Input
            id="host-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={index} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-row flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t("host.seat", { number: index + 2 })}</span>
              <Button
                size="sm"
                variant={row.kind === "guest" ? "default" : "outline"}
                aria-pressed={row.kind === "guest"}
                onClick={() => setRow(index, { kind: "guest" })}
              >
                {t("host.guest")}
              </Button>
              <Button
                size="sm"
                variant={row.kind === "bot" ? "default" : "outline"}
                aria-pressed={row.kind === "bot"}
                onClick={() => setRow(index, { kind: "bot" })}
              >
                {t("lobby.ai")}
              </Button>
            </div>
            {row.kind === "guest" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label={t("host.guestNameLabel")}
                  placeholder={t("host.guestNameLabel")}
                  value={row.name}
                  onChange={(event) => setRow(index, { name: event.target.value })}
                />
                <Input
                  aria-label={t("host.guestDeck")}
                  placeholder={t("host.guestDeck")}
                  value={row.deck}
                  onChange={(event) => setRow(index, { deck: event.target.value })}
                />
              </div>
            ) : (
              <div className="flex flex-row flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("lobby.level")}</span>
                {BOT_LEVELS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={row.level === value ? "secondary" : "outline"}
                    aria-pressed={row.level === value}
                    onClick={() => setRow(index, { level: value })}
                  >
                    {t(`level.${value}`)}
                  </Button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-row flex-wrap gap-2">
        <Button disabled={busy || !server.trim() || !token.trim()} onClick={create}>
          {t("host.create")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("host.tls")}</p>
    </div>
  );
}
