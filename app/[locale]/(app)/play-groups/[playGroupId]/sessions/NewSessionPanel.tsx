"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";
import type { PlayGroupPlace, PlayGroupPlaceKind } from "@/lib/types/PlayGroup";

import { createPlayGroupSession } from "../actions.ts";

const PLACE_KINDS: PlayGroupPlaceKind[] = ["joutes", "free", "member"];

export type LairChoice = { id: string; name: string; address?: string };

/**
 * Le panneau de création d'une session.
 *
 * Une seule question sépare vraiment les deux formes possibles : sait-on déjà
 * quand ? Si oui, c'est une session confirmée ; sinon, on propose des créneaux
 * et le groupe tranche. Le panneau reflète ce choix par un segmenté plutôt que
 * par deux écrans distincts — c'est la même session dans les deux cas.
 */
export default function NewSessionPanel({
  playGroupId,
  games,
  lairs,
  defaultPlace,
}: {
  playGroupId: string;
  games: { id: string; name: string }[];
  /** Les lieux Joutes déjà fréquentés par le groupe, plus celui de son rythme. */
  lairs: LairChoice[];
  defaultPlace?: PlayGroupPlace;
}) {
  const t = useTranslations("PlayGroups.hub.newSession");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  // Vide par défaut : le sélecteur offre « aucun jeu en particulier », et
  // préchoisir le premier de la liste le contredirait en silence.
  const [gameId, setGameId] = useState("");
  const [placeKind, setPlaceKind] = useState<PlayGroupPlaceKind>(defaultPlace?.kind ?? (lairs.length > 0 ? "joutes" : "free"));
  const [lairId, setLairId] = useState(defaultPlace?.lairId ?? lairs[0]?.id ?? "");
  const [placeLabel, setPlaceLabel] = useState(defaultPlace?.kind !== "joutes" ? (defaultPlace?.label ?? "") : "");
  const [placeDetail, setPlaceDetail] = useState(defaultPlace?.detail ?? "");
  const [mode, setMode] = useState<"date" | "poll">("date");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [slots, setSlots] = useState<string[]>([""]);

  const reset = () => {
    setTitle("");
    setStartsAt("");
    setEndsAt("");
    setSlots([""]);
    setOpen(false);
  };

  const buildPlace = (): PlayGroupPlace | undefined => {
    if (placeKind === "joutes") {
      const lair = lairs.find((item) => item.id === lairId);
      return lair ? { kind: "joutes", lairId: lair.id, label: lair.name, detail: lair.address } : undefined;
    }

    if (placeLabel.trim().length === 0) {
      return undefined;
    }

    return { kind: placeKind, label: placeLabel.trim(), detail: placeDetail.trim() || undefined };
  };

  const onSubmit = () => {
    const filledSlots = slots.map((value) => value.trim()).filter(Boolean);

    startTransition(async () => {
      const result = await createPlayGroupSession(playGroupId, {
        title,
        gameId: gameId || undefined,
        place: buildPlace(),
        // `datetime-local` rend « 2026-08-28T19:30 » : une heure locale sans
        // fuseau. Elle est envoyée telle quelle, et relue telle quelle — la
        // session a lieu à l'heure du groupe, pas à celle du lecteur.
        startsAt: mode === "date" ? startsAt : undefined,
        endsAt: mode === "date" ? endsAt : undefined,
        slots: mode === "poll" ? filledSlots.map((value) => ({ startsAt: value })) : [],
      });

      if (result.success) {
        reset();
        return;
      }

      toast.error(t(result.error === "INVALID" ? "invalid" : "error"));
    });
  };

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {t("open")}
      </Button>
    );
  }

  return (
    // `basis-full` et non `w-full` : le panneau est posé dans la rangée du
    // titre, qui passe à la ligne. Réclamer 100 % de cette rangée écrasait le
    // titre au lieu de descendre sous lui.
    <section className="flex basis-full flex-col gap-4 rounded-xl border border-[var(--group-accent-40)] bg-background/60 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Plus className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={reset} aria-label={t("cancel")}>
          <X aria-hidden />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-title">{t("titleLabel")}</Label>
          <Input
            id="session-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("titlePlaceholder")}
          />
        </div>

        {games.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-game">{t("gameLabel")}</Label>
            <select
              id="session-game"
              value={gameId}
              onChange={(event) => setGameId(event.target.value)}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">{t("gameNone")}</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm text-muted-foreground">{t("whereLabel")}</span>
          <div className="flex flex-wrap gap-1 rounded-[9px] border p-1">
            {PLACE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setPlaceKind(kind)}
                className={cn(
                  "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
                  placeKind === kind
                    ? "bg-[var(--group-accent-16)] font-semibold text-[var(--group-accent-text)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`place.${kind}`)}
              </button>
            ))}
          </div>
        </div>

        {placeKind === "joutes" ? (
          lairs.length > 0 ? (
            <select
              value={lairId}
              onChange={(event) => setLairId(event.target.value)}
              aria-label={t("place.lairLabel")}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {lairs.map((lair) => (
                <option key={lair.id} value={lair.id}>
                  {lair.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-[10px] border border-dashed px-3.5 py-3 text-[13px] text-muted-foreground">
              {t("place.noLair")}
            </p>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={placeLabel}
              onChange={(event) => setPlaceLabel(event.target.value)}
              placeholder={t("place.freePlaceholder")}
              aria-label={t("place.freeLabel")}
            />
            <Input
              value={placeDetail}
              onChange={(event) => setPlaceDetail(event.target.value)}
              placeholder={t("place.detailPlaceholder")}
              aria-label={t("place.detailLabel")}
            />
          </div>
        )}

        <p className="text-[13px] text-muted-foreground">{t("place.explanation")}</p>
      </div>

      <div className="flex flex-col gap-2.5 border-t pt-4">
        <div className="flex flex-wrap gap-1 self-start rounded-[9px] border p-1">
          {(["date", "poll"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
                mode === value
                  ? "bg-[var(--group-accent-16)] font-semibold text-[var(--group-accent-text)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(value === "date" ? "modeDate" : "modePoll")}
            </button>
          ))}
        </div>

        {mode === "date" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-starts">{t("startsAtLabel")}</Label>
              <Input
                id="session-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-ends">{t("endsAtLabel")}</Label>
              <Input
                id="session-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {slots.map((slot, index) => (
              <div className="flex flex-wrap items-center gap-2" key={index}>
                <Input
                  type="datetime-local"
                  value={slot}
                  aria-label={t("slotLabel", { index: index + 1 })}
                  onChange={(event) =>
                    setSlots((current) => current.map((value, position) => (position === index ? event.target.value : value)))
                  }
                  className="sm:max-w-xs"
                />
                {slots.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("removeSlot")}
                    onClick={() => setSlots((current) => current.filter((_, position) => position !== index))}
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            {slots.length < 8 && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setSlots((current) => [...current, ""])}
              >
                <Plus aria-hidden />
                {t("addSlot")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button variant="outline" size="sm" onClick={reset} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={pending || title.trim().length === 0}>
          {t("submit")}
        </Button>
      </div>
    </section>
  );
}
