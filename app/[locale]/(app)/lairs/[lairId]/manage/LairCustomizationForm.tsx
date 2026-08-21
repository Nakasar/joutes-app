"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import { LAIR_ACCENT_PALETTE } from "@/lib/lairs/theme.ts";
import type { LairAccentColor } from "@/lib/lairs/theme.ts";
import { readLairSections, type LairSection } from "@/lib/lairs/sections.ts";
import { MAX_OPENING_RANGES_PER_DAY, rangesOfDay } from "@/lib/lairs/opening-hours.ts";
import type { Lair, LairLink, LairOrganizer } from "@/lib/types/Lair";

import ImageDropzone from "./ImageDropzone.tsx";
import LairSectionsField from "./LairSectionsField.tsx";
import {
  updateLairCustomization,
  type LairCustomizationError,
} from "./customization-actions.ts";

const ERROR_KEYS: Record<LairCustomizationError, string> = {
  INVALID: "errors.invalid",
  NOT_FOUND: "errors.notFound",
  PRO_REQUIRED: "errors.proRequired",
  FAILED: "errors.failed",
};

const LINK_TYPES = [
  "website",
  "instagram",
  "facebook",
  "discord",
  "twitch",
  "youtube",
  "x",
  "other",
] as const;

const MAX_LINKS = 6;
const MAX_PHOTOS = 4;
/** Les sept jours en numérotation ISO — 1 = lundi … 7 = dimanche. */
const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Une plage vide : la ligne qu'un jour fermé propose à la saisie. */
const EMPTY_RANGE = { open: "", close: "" };

type FormState = {
  logo?: string;
  accentColor?: LairAccentColor;
  tintSurfaces: boolean;
  sections: LairSection[];
  links: LairLink[];
  phone: string;
  email: string;
  /** Les plages de chaque jour ISO — plusieurs pour un horaire coupé. */
  openingHours: Record<number, { open: string; close: string }[]>;
  description: string;
  category: string;
  amenities: string[];
  photos: string[];
  videoUrl: string;
  transit: string;
  parking: string;
  organizers: LairOrganizer[];
  rhythm: { label: string; value: string }[];
  featuredEventId: string;
};

const MAX_ORGANIZERS = 8;
const MAX_RHYTHM = 6;

function initialState(lair: Lair): FormState {
  const options = lair.options ?? {};

  return {
    logo: options.theme?.logo,
    // Un accent hors palette — écrit avant qu'elle soit fermée, ou à la main
    // en base — n'est pas proposé comme sélection : aucune pastille ne s'allume.
    accentColor: LAIR_ACCENT_PALETTE.find((color) => color === options.theme?.accentColor),
    tintSurfaces: options.theme?.tintSurfaces ?? false,
    sections: readLairSections(lair),
    links: options.links ?? [],
    phone: options.contact?.phone ?? "",
    email: options.contact?.email ?? "",
    openingHours: Object.fromEntries(
      DAYS.map((day) => [
        day,
        rangesOfDay(options.openingHours, day).map((entry) => ({
          open: entry.open ?? "",
          close: entry.close ?? "",
        })),
      ]),
    ),
    description: options.about?.description ?? "",
    category: options.about?.category ?? "",
    amenities: options.about?.amenities ?? [],
    photos: options.about?.photos ?? [],
    videoUrl: options.about?.videoUrl ?? "",
    transit: options.about?.transit ?? "",
    parking: options.about?.parking ?? "",
    organizers: options.about?.organizers ?? [],
    rhythm: options.about?.rhythm ?? [],
    featuredEventId: options.featuredEventId ?? "",
  };
}

/**
 * L'écran de configuration de la vitrine.
 *
 * Un seul formulaire et une seule sauvegarde pour tout ce qui est réglage —
 * identité, sections, liens, horaires, contact, présentation. Les actualités
 * ont leur propre onglet : ce sont des contenus qu'on publie au fil de l'eau,
 * pas des réglages qu'on ajuste puis qu'on enregistre.
 *
 * `isPro` grise ce qui relève de la marque blanche. C'est un confort
 * d'affichage, pas une sécurité : l'action serveur refait le contrôle et
 * conserve les valeurs existantes pour ces champs.
 */
export default function LairCustomizationForm({
  lair,
  isPro,
  upcomingEvents,
}: {
  lair: Lair;
  isPro: boolean;
  upcomingEvents: { id: string; name: string; startDateTime: string }[];
}) {
  const t = useTranslations("Lairs.manage.customization");
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>(() => initialState(lair));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [amenityDraft, setAmenityDraft] = useState("");

  // Le repère de comparaison est ce qui a été **envoyé et accepté**, non ce
  // que le serveur a relu. Le serveur normalise — il retire une plage horaire
  // à moitié saisie, rogne les espaces — et comparer au lieu relu laisserait
  // le formulaire éternellement « modifié » après un enregistrement pourtant
  // réussi, sans qu'aucune sauvegarde puisse jamais faire converger les deux.
  const [saved, setSaved] = useState(() => JSON.stringify(initialState(lair)));
  const isDirty = JSON.stringify(state) !== saved;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const save = () => {
    setIssues({});

    // Les lignes incomplètes sont retirées de l'état **avant** l'envoi, et non
    // seulement de la charge : garder l'état non filtré comme repère faisait
    // annoncer « enregistré » pour une ligne qui n'était jamais partie, et qui
    // disparaissait au rechargement suivant.
    const cleaned: FormState = {
      ...state,
      openingHours: Object.fromEntries(
        DAYS.map((day) => [
          day,
          (state.openingHours[day] ?? []).filter((range) => range.open && range.close),
        ]),
      ),
      organizers: state.organizers.filter((entry) => entry.name.trim().length > 0),
      rhythm: state.rhythm.filter(
        (entry) => entry.label.trim().length > 0 && entry.value.trim().length > 0,
      ),
    };
    setState(cleaned);

    startTransition(async () => {
      const result = await updateLairCustomization(lair.id, {
        theme: {
          logo: state.logo ?? "",
          accentColor: state.accentColor ?? "",
          tintSurfaces: state.tintSurfaces,
        },
        sections: state.sections.map(({ key, enabled }) => ({ key, enabled })),
        links: state.links,
        contact: { phone: state.phone, email: state.email },
        // Une ligne par plage, plusieurs par jour quand l'horaire est coupé :
        // c'est le format que la vitrine relit, `day` répété et tout.
        openingHours: DAYS.flatMap((day) =>
          (cleaned.openingHours[day] ?? []).map((range) => ({
            day,
            open: range.open,
            close: range.close,
          })),
        ),
        about: {
          description: cleaned.description,
          category: cleaned.category,
          amenities: cleaned.amenities,
          photos: cleaned.photos,
          videoUrl: cleaned.videoUrl,
          transit: cleaned.transit,
          parking: cleaned.parking,
          organizers: cleaned.organizers,
          rhythm: cleaned.rhythm,
        },
        featuredEventId: state.featuredEventId,
      });

      if (result.success) {
        setSaved(JSON.stringify(cleaned));
        toast.success(t("saved"));
        return;
      }

      setIssues(result.issues ?? {});
      toast.error(t(ERROR_KEYS[result.error]));
    });
  };

  const proHint = (field: string) =>
    isPro ? null : (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        {t("proLocked")}
        <span className="sr-only">{field}</span>
      </span>
    );

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {/* Identité — logo, accent, teinte des surfaces. */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <header className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{t("identity.title")}</h3>
          <p className="text-[13px] text-muted-foreground">{t("identity.description")}</p>
        </header>

        <div className="flex flex-wrap items-start gap-4">
          <ImageDropzone
            lairId={lair.id}
            value={state.logo}
            onChange={(url) => set("logo", url)}
            label={t("identity.logoLabel")}
            disabled={!isPro}
            className="w-[84px]"
            previewClassName="h-[84px] rounded-xl"
          />
          <p className="flex-1 text-[13px] text-muted-foreground">
            {t("identity.bannerNote")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label>{t("identity.accent")}</Label>
            {proHint(t("identity.accent"))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {LAIR_ACCENT_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                disabled={!isPro}
                aria-label={color}
                aria-pressed={state.accentColor === color}
                onClick={() => set("accentColor", state.accentColor === color ? undefined : color)}
                style={{ backgroundColor: color }}
                className={cn(
                  "size-[30px] rounded-lg transition-transform disabled:cursor-not-allowed disabled:opacity-50",
                  state.accentColor === color
                    ? "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card"
                    : "hover:scale-105",
                )}
              />
            ))}
            <span className="font-mono text-xs text-muted-foreground">
              {state.accentColor ?? t("identity.noAccent")}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm">{t("identity.tint")}</span>
            <span className="text-[13px] text-muted-foreground">{t("identity.tintHint")}</span>
          </div>
          <Switch
            checked={state.tintSurfaces}
            disabled={!isPro}
            aria-label={t("identity.tint")}
            onCheckedChange={(checked) => set("tintSurfaces", checked)}
          />
        </div>
      </section>

      {/* Sections de la page. */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <header className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{t("sections.title")}</h3>
            {proHint(t("sections.title"))}
          </div>
          <p className="text-[13px] text-muted-foreground">{t("sections.description")}</p>
        </header>

        <LairSectionsField
          sections={state.sections}
          onChange={(sections) => set("sections", sections)}
          disabled={!isPro}
        />
      </section>

      {/* Liens & réseaux. */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{t("links.title")}</h3>
          <span className="rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {t("links.max", { count: MAX_LINKS })}
          </span>
        </header>

        <div className="flex flex-col gap-2">
          {state.links.map((link, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Select
                value={link.type}
                onValueChange={(type) =>
                  set(
                    "links",
                    state.links.map((item, i) =>
                      i === index ? { ...item, type: type as LairLink["type"] } : item,
                    ),
                  )
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`links.types.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="url"
                value={link.url}
                placeholder="https://"
                aria-label={t("links.url")}
                className="min-w-0 flex-1 font-mono text-xs"
                onChange={(event) =>
                  set(
                    "links",
                    state.links.map((item, i) =>
                      i === index ? { ...item, url: event.target.value } : item,
                    ),
                  )
                }
              />

              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("links.remove")}
                onClick={() => set("links", state.links.filter((_, i) => i !== index))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}

          {issues["links"] && <p className="text-xs text-destructive">{issues["links"]}</p>}

          {state.links.length < MAX_LINKS && (
            <Button
              type="button"
              variant="outline"
              className="justify-start border-dashed"
              onClick={() => set("links", [...state.links, { type: "website", url: "" }])}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              {t("links.add")}
            </Button>
          )}
        </div>
      </section>

      {/* Horaires et contact. */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <header className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{t("hours.title")}</h3>
          <p className="text-[13px] text-muted-foreground">{t("hours.description")}</p>
        </header>

        {issues.openingHours && (
          <p className="text-xs text-destructive">{issues.openingHours}</p>
        )}

        <div className="flex flex-col gap-3">
          {DAYS.map((day) => {
            const dayLabel = t(`hours.days.${day}`);
            // Un jour fermé garde une ligne vide : c'est là qu'on saisit ses
            // horaires quand il ouvre enfin, et une ligne à faire apparaître
            // avant de pouvoir taper serait un pas de trop.
            const stored = state.openingHours[day] ?? [];
            const ranges = stored.length > 0 ? stored : [EMPTY_RANGE];

            const write = (next: { open: string; close: string }[]) =>
              set("openingHours", { ...state.openingHours, [day]: next });

            return (
              <div key={day} className="flex flex-wrap items-start gap-2">
                <span className="w-28 shrink-0 pt-2 text-sm">{dayLabel}</span>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {ranges.map((range, index) => {
                    // Le libellé accessible ne numérote la plage que lorsqu'il y
                    // en a plusieurs : « Ouverture mardi » suffit tant que mardi
                    // n'a qu'un seul créneau.
                    const label = (key: "opensAt" | "closesAt") =>
                      ranges.length > 1
                        ? t(`hours.${key}Range`, { day: dayLabel, index: index + 1 })
                        : t(`hours.${key}`, { day: dayLabel });

                    const update = (next: { open: string; close: string }) =>
                      write(ranges.map((item, i) => (i === index ? next : item)));

                    return (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          value={range.open}
                          aria-label={label("opensAt")}
                          className="w-32"
                          onChange={(event) => update({ ...range, open: event.target.value })}
                        />
                        <span className="text-muted-foreground">—</span>
                        <Input
                          type="time"
                          value={range.close}
                          aria-label={label("closesAt")}
                          className="w-32"
                          onChange={(event) => update({ ...range, close: event.target.value })}
                        />
                        {ranges.length > 1 ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t("hours.removeRange", { day: dayLabel })}
                            onClick={() => write(ranges.filter((_, i) => i !== index))}
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        ) : (
                          (range.open || range.close) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => write([])}
                            >
                              {t("hours.closed")}
                            </Button>
                          )
                        )}
                      </div>
                    );
                  })}

                  {/* La seconde plage ne s'ouvre qu'une fois la première tenue :
                      un jour dont on n'a pas dit l'ouverture n'a pas de coupure
                      à décrire. */}
                  {ranges.length < MAX_OPENING_RANGES_PER_DAY &&
                    ranges.every((range) => range.open && range.close) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="self-start"
                        onClick={() => write([...ranges, { ...EMPTY_RANGE }])}
                      >
                        <Plus className="mr-2 size-4" aria-hidden />
                        {t("hours.addRange")}
                      </Button>
                    )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lair-phone">{t("contact.phone")}</Label>
            <Input
              id="lair-phone"
              value={state.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lair-email">{t("contact.email")}</Label>
            <Input
              id="lair-email"
              type="email"
              value={state.email}
              onChange={(event) => set("email", event.target.value)}
            />
            {issues["contact.email"] && (
              <p className="text-xs text-destructive">{issues["contact.email"]}</p>
            )}
          </div>
        </div>
      </section>

      {/* Présentation & galerie. */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <header className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{t("about.title")}</h3>
          <p className="text-[13px] text-muted-foreground">{t("about.description")}</p>
        </header>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lair-category">{t("about.category")}</Label>
          <Input
            id="lair-category"
            value={state.category}
            placeholder={t("about.categoryPlaceholder")}
            onChange={(event) => set("category", event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lair-description">{t("about.text")}</Label>
          <Textarea
            id="lair-description"
            rows={6}
            value={state.description}
            placeholder={t("about.textPlaceholder")}
            onChange={(event) => set("description", event.target.value)}
          />
          <p className="font-mono text-[11px] text-muted-foreground">{t("about.markdown")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("about.amenities")}</Label>
          <div className="flex flex-wrap gap-2">
            {state.amenities.map((amenity, index) => (
              <span
                key={`${amenity}-${index}`}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]"
              >
                {amenity}
                <button
                  type="button"
                  aria-label={t("about.removeAmenity", { amenity })}
                  onClick={() => set("amenities", state.amenities.filter((_, i) => i !== index))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={amenityDraft}
              placeholder={t("about.amenityPlaceholder")}
              aria-label={t("about.amenities")}
              className="w-52"
              onChange={(event) => setAmenityDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  // Sans ça, la touche Entrée d'un champ de saisie soumet le
                  // formulaire entier au lieu d'ajouter l'équipement.
                  event.preventDefault();
                  const value = amenityDraft.trim();
                  if (value && state.amenities.length < 12) {
                    set("amenities", [...state.amenities, value]);
                    setAmenityDraft("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!amenityDraft.trim() || state.amenities.length >= 12}
              onClick={() => {
                set("amenities", [...state.amenities, amenityDraft.trim()]);
                setAmenityDraft("");
              }}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              {t("about.addAmenity")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("about.photos", { count: MAX_PHOTOS })}</Label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {Array.from({ length: MAX_PHOTOS }, (_, index) => (
              <ImageDropzone
                key={index}
                lairId={lair.id}
                value={state.photos[index]}
                label={t("about.photoLabel", { index: index + 1 })}
                previewClassName="h-24"
                onChange={(url) => {
                  const next = [...state.photos];
                  if (url) {
                    next[index] = url;
                  } else {
                    next.splice(index, 1);
                  }
                  // Les trous rendraient la quatrième photo invisible tant que
                  // la deuxième manque : la galerie publique lit une liste
                  // continue.
                  set("photos", next.filter(Boolean));
                }}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="lair-video">{t("about.video")}</Label>
              {proHint(t("about.video"))}
            </div>
            <Input
              id="lair-video"
              type="url"
              value={state.videoUrl}
              disabled={!isPro}
              placeholder="https://youtube.com/watch?v=…"
              className="font-mono text-xs"
              onChange={(event) => set("videoUrl", event.target.value)}
            />
            {issues["about.videoUrl"] && (
              <p className="text-xs text-destructive">{issues["about.videoUrl"]}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lair-featured">{t("featured.title")}</Label>
            <Select
              value={state.featuredEventId || "none"}
              onValueChange={(value) => set("featuredEventId", value === "none" ? "" : value)}
            >
              <SelectTrigger id="lair-featured">
                <SelectValue placeholder={t("featured.none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("featured.none")}</SelectItem>
                {upcomingEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lair-transit">{t("about.transit")}</Label>
            <Input
              id="lair-transit"
              value={state.transit}
              placeholder={t("about.transitPlaceholder")}
              onChange={(event) => set("transit", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lair-parking">{t("about.parking")}</Label>
            <Input
              id="lair-parking"
              value={state.parking}
              placeholder={t("about.parkingPlaceholder")}
              onChange={(event) => set("parking", event.target.value)}
            />
          </div>
        </div>

        {/* L'équipe du lieu, affichée dans la colonne de l'onglet « À propos ». */}
        <div className="flex flex-col gap-2">
          <Label>{t("organizers.title")}</Label>
          <p className="text-[13px] text-muted-foreground">{t("organizers.description")}</p>

          {state.organizers.map((organizer, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                value={organizer.name}
                placeholder={t("organizers.namePlaceholder")}
                aria-label={t("organizers.name")}
                className="min-w-0 flex-1"
                onChange={(event) =>
                  set(
                    "organizers",
                    state.organizers.map((item, i) =>
                      i === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                value={organizer.role ?? ""}
                placeholder={t("organizers.rolePlaceholder")}
                aria-label={t("organizers.role")}
                className="min-w-0 flex-1"
                onChange={(event) =>
                  set(
                    "organizers",
                    state.organizers.map((item, i) =>
                      i === index ? { ...item, role: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("organizers.remove", { name: organizer.name })}
                onClick={() => set("organizers", state.organizers.filter((_, i) => i !== index))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}

          {state.organizers.length < MAX_ORGANIZERS && (
            <Button
              type="button"
              variant="outline"
              className="justify-start border-dashed"
              onClick={() => set("organizers", [...state.organizers, { name: "" }])}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              {t("organizers.add")}
            </Button>
          )}
        </div>

        {/* Le rythme habituel, affiché dans la colonne de l'onglet « Agenda ». */}
        <div className="flex flex-col gap-2">
          <Label>{t("rhythm.title")}</Label>
          <p className="text-[13px] text-muted-foreground">{t("rhythm.description")}</p>

          {state.rhythm.map((entry, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                value={entry.label}
                placeholder={t("rhythm.labelPlaceholder")}
                aria-label={t("rhythm.label")}
                className="min-w-0 flex-1"
                onChange={(event) =>
                  set(
                    "rhythm",
                    state.rhythm.map((item, i) =>
                      i === index ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                value={entry.value}
                placeholder={t("rhythm.valuePlaceholder")}
                aria-label={t("rhythm.value")}
                className="min-w-0 flex-1"
                onChange={(event) =>
                  set(
                    "rhythm",
                    state.rhythm.map((item, i) =>
                      i === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("rhythm.remove", { label: entry.label })}
                onClick={() => set("rhythm", state.rhythm.filter((_, i) => i !== index))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}

          {state.rhythm.length < MAX_RHYTHM && (
            <Button
              type="button"
              variant="outline"
              className="justify-start border-dashed"
              onClick={() => set("rhythm", [...state.rhythm, { label: "", value: "" }])}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              {t("rhythm.add")}
            </Button>
          )}
        </div>
      </section>

      {/* Les chemins renvoyés par Zod sont fins (`links.0.url`,
          `about.photos.1`) et ne correspondent pas tous à un message posé sous
          un champ : ce récapitulatif garantit qu'aucun refus ne se réduit à un
          toast rouge sans dire ce qui cloche. */}
      {Object.keys(issues).length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          {Object.entries(issues).map(([path, message]) => (
            <li key={path} className="text-xs text-destructive">
              <span className="font-mono opacity-70">{path}</span> — {message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || !isDirty}>
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !isDirty}
          onClick={() => {
            setState(initialState(lair));
            setSaved(JSON.stringify(initialState(lair)));
            setIssues({});
          }}
        >
          {t("cancel")}
        </Button>
        {isDirty && (
          <span className="font-mono text-[11px] text-muted-foreground">{t("unsaved")}</span>
        )}
      </div>
    </form>
  );
}
