"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { PLAY_GROUP_ACCENT_PALETTE } from "@/lib/play-groups/theme.ts";
import { cn } from "@/lib/utils.ts";
import type { PlayGroup, PlayGroupLink, PlayGroupLinkType, PlayGroupPlaceKind } from "@/lib/types/PlayGroup";

import { updatePlayGroupIdentity } from "../actions.ts";

const LINK_TYPES: PlayGroupLinkType[] = [
  "website",
  "twitch",
  "youtube",
  "discord",
  "instagram",
  "facebook",
  "x",
  "other",
];

const PLACE_KINDS: PlayGroupPlaceKind[] = ["joutes", "free", "member"];

/**
 * La personnalisation du groupe : identité, marque blanche, liens, rythme.
 *
 * Un seul formulaire pour ces quatre-là parce qu'ils se règlent en même temps
 * — on habille son groupe d'un coup, pas champ par champ sur quatre écrans.
 * Les jeux activés gardent leur propre écran : ils ne relèvent pas de
 * l'apparence mais de ce que le groupe collectionne.
 *
 * L'accent est une palette fermée : un accent choisi librement finit par
 * tomber sur un gris qui disparaît, ou sur un ton qui rend le texte des
 * boutons illisible.
 */
export default function PlayGroupIdentityForm({
  group,
  lairs,
}: {
  group: PlayGroup;
  lairs: { id: string; name: string }[];
}) {
  const t = useTranslations("PlayGroups.hub.settings");
  const [pending, startTransition] = useTransition();

  const theme = group.options?.theme;
  const rhythm = group.options?.rhythm;

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [tagline, setTagline] = useState(theme?.tagline ?? "");
  const [logo, setLogo] = useState(theme?.logo ?? "");
  const [banner, setBanner] = useState(theme?.banner ?? "");
  const [accentColor, setAccentColor] = useState<string | null>(theme?.accentColor ?? null);
  const [links, setLinks] = useState<PlayGroupLink[]>(group.options?.links ?? []);
  const [rhythmLabel, setRhythmLabel] = useState(rhythm?.label ?? "");
  const [placeKind, setPlaceKind] = useState<PlayGroupPlaceKind | "">(rhythm?.defaultPlace?.kind ?? "");
  const [lairId, setLairId] = useState(rhythm?.defaultPlace?.lairId ?? lairs[0]?.id ?? "");
  const [placeLabel, setPlaceLabel] = useState(
    rhythm?.defaultPlace?.kind !== "joutes" ? (rhythm?.defaultPlace?.label ?? "") : "",
  );

  const buildDefaultPlace = () => {
    if (placeKind === "") {
      return undefined;
    }

    if (placeKind === "joutes") {
      const lair = lairs.find((item) => item.id === lairId);
      return lair ? { kind: "joutes" as const, lairId: lair.id, label: lair.name } : undefined;
    }

    return placeLabel.trim().length > 0 ? { kind: placeKind, label: placeLabel.trim() } : undefined;
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    startTransition(async () => {
      const result = await updatePlayGroupIdentity(group.id, {
        name,
        description,
        logo,
        banner,
        accentColor,
        tagline,
        links: links.filter((link) => link.url.trim().length > 0),
        rhythmLabel,
        defaultPlace: buildDefaultPlace(),
      });

      if (result.success) {
        toast.success(t("saved"));
        return;
      }

      toast.error(t(result.error === "INVALID" ? "invalid" : "error"));
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-bold">{t("identityTitle")}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="group-name">{t("nameLabel")}</Label>
          <Input id="group-name" required value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="group-tagline">{t("taglineLabel")}</Label>
          <Input
            id="group-tagline"
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
            placeholder={t("taglinePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("taglineHint")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="group-description">{t("descriptionLabel")}</Label>
          <Textarea
            id="group-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-bold">{t("brandTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("brandHint")}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-logo">{t("logoLabel")}</Label>
            <Input
              id="group-logo"
              type="url"
              value={logo}
              onChange={(event) => setLogo(event.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-banner">{t("bannerLabel")}</Label>
            <Input
              id="group-banner"
              type="url"
              value={banner}
              onChange={(event) => setBanner(event.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("accentLabel")}</legend>
          <div className="flex flex-wrap items-center gap-2">
            {PLAY_GROUP_ACCENT_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={accentColor === color}
                onClick={() => setAccentColor(color)}
                style={{ backgroundColor: color }}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform",
                  accentColor === color ? "scale-110 border-foreground" : "border-transparent",
                )}
              />
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setAccentColor(null)}>
              {t("accentReset")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("accentHint")}</p>
        </fieldset>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-bold">{t("linksTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("linksHint")}</p>

        {links.map((link, index) => (
          <div className="flex flex-wrap items-center gap-2" key={index}>
            <select
              value={link.type}
              aria-label={t("linkTypeLabel")}
              onChange={(event) =>
                setLinks((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, type: event.target.value as PlayGroupLinkType } : item,
                  ),
                )
              }
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {LINK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`linkTypes.${type}`)}
                </option>
              ))}
            </select>

            <Input
              type="url"
              value={link.url}
              aria-label={t("linkUrlLabel")}
              placeholder="https://…"
              className="sm:max-w-sm"
              onChange={(event) =>
                setLinks((current) =>
                  current.map((item, position) => (position === index ? { ...item, url: event.target.value } : item)),
                )
              }
            />

            <Input
              value={link.label ?? ""}
              aria-label={t("linkLabelLabel")}
              placeholder={t("linkLabelPlaceholder")}
              className="sm:max-w-[200px]"
              onChange={(event) =>
                setLinks((current) =>
                  current.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)),
                )
              }
            />

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("linkRemove")}
              onClick={() => setLinks((current) => current.filter((_, position) => position !== index))}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}

        {links.length < 8 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setLinks((current) => [...current, { type: "website", url: "" }])}
          >
            <Plus aria-hidden />
            {t("linkAdd")}
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-bold">{t("rhythmTitle")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("rhythmHint")}</p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="group-rhythm">{t("rhythmLabel")}</Label>
          <Input
            id="group-rhythm"
            value={rhythmLabel}
            onChange={(event) => setRhythmLabel(event.target.value)}
            placeholder={t("rhythmPlaceholder")}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-medium">{t("defaultPlaceLabel")}</span>
          <div className="flex flex-wrap gap-1 self-start rounded-[9px] border p-1">
            <button
              type="button"
              onClick={() => setPlaceKind("")}
              className={cn(
                "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
                placeKind === ""
                  ? "bg-[var(--group-accent-16)] font-semibold text-[var(--group-accent-text)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("defaultPlaceNone")}
            </button>
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

          {placeKind === "joutes" &&
            (lairs.length > 0 ? (
              <select
                value={lairId}
                aria-label={t("defaultLairLabel")}
                onChange={(event) => setLairId(event.target.value)}
                className="h-9 self-start rounded-md border bg-transparent px-3 text-sm"
              >
                {lairs.map((lair) => (
                  <option key={lair.id} value={lair.id}>
                    {lair.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("noLair")}</p>
            ))}

          {(placeKind === "free" || placeKind === "member") && (
            <Input
              value={placeLabel}
              aria-label={t("defaultPlaceFreeLabel")}
              placeholder={t("defaultPlaceFreePlaceholder")}
              className="sm:max-w-sm"
              onChange={(event) => setPlaceLabel(event.target.value)}
            />
          )}
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
