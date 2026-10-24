"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { AlertCircle, ImageIcon, Info, Loader2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DateTime } from "luxon";
import { createEventAction, updateEventDetailsAction } from "./actions.ts";
import { Lair } from "@/lib/types/Lair.ts";
import { Game } from "@/lib/types/Game.ts";
import type { ParticipantsVisibility } from "@/lib/types/Event.ts";
import { PARTICIPANTS_VISIBILITIES } from "@/lib/events/attendees.ts";
import { EventBanner } from "./EventBanner.tsx";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Les heures d'un événement se saisissent et se lisent à l'heure du lieu.
const EVENT_ZONE = "Europe/Paris";
const NO_LAIR = "__none__";

/** Ce que le formulaire reprend d'un événement existant. */
export type EditableEvent = {
  id: string;
  name: string;
  description?: string;
  banner?: string;
  gameName: string;
  lairId?: string;
  lairName?: string;
  startDateTime: string;
  endDateTime: string;
  url?: string;
  price?: number;
  maxParticipants?: number;
  participantsVisibility?: ParticipantsVisibility;
  registeredCount: number;
};

type EventFormProps = {
  ownedLairs: Lair[];
  games: Game[];
  /**
   * Création lancée depuis un tournoi : l'événement créé lui est rattaché dans
   * la foulée, et l'organisateur revient à ses réglages plutôt que d'atterrir
   * sur une page d'événement sans lien avec ce qu'il faisait.
   */
  linkTournament?: { id: string; name: string } | null;
  /** Présent : le formulaire modifie cet événement au lieu d'en créer un. */
  event?: EditableEvent;
};

function toInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = DateTime.fromISO(iso, { setZone: true }).setZone(EVENT_ZONE);
  return parsed.isValid ? parsed.toFormat("yyyy-MM-dd'T'HH:mm") : "";
}

/** Une saisie `datetime-local` lue à l'heure du lieu, rendue avec son décalage. */
function fromInputValue(value: string): string {
  return DateTime.fromISO(value, { zone: EVENT_ZONE }).toISO() ?? value;
}

export default function EventForm({ ownedLairs, games, linkTournament = null, event }: EventFormProps) {
  const router = useRouter();
  const t = useTranslations("EventCreate");
  const locale = useLocale();
  const isEdit = Boolean(event);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionTab, setDescriptionTab] = useState<"write" | "preview">("write");
  const [formData, setFormData] = useState({
    name: event?.name ?? linkTournament?.name ?? "",
    description: event?.description ?? "",
    banner: event?.banner ?? "",
    startDateTime: toInputValue(event?.startDateTime),
    endDateTime: toInputValue(event?.endDateTime),
    gameName: event?.gameName ?? "",
    lairId: event?.lairId ?? "",
    url: event?.url ?? "",
    price: event?.price !== undefined && event?.price !== null ? String(event.price) : "",
    maxParticipants: event?.maxParticipants ? String(event.maxParticipants) : "",
    preRegistration: false,
    allowJoin: true,
    participantsVisibility: event?.participantsVisibility ?? ("public" as ParticipantsVisibility),
  });
  const update = (patch: Partial<typeof formData>) => setFormData((current) => ({ ...current, ...patch }));

  // Le lieu actuel reste proposé même quand on n'en est pas propriétaire
  // (un organisateur invité) : le garder ne demande aucun droit.
  const lairOptions = event?.lairId && !ownedLairs.some((lair) => lair.id === event.lairId)
    ? [{ id: event.lairId, name: event.lairName ?? event.lairId }, ...ownedLairs]
    : ownedLairs;
  const selectedGame = games.find((game) => game.name === formData.gameName);
  const previewBanner = formData.banner || selectedGame?.banner;
  const scheduleChanged = isEdit && (
    formData.startDateTime !== toInputValue(event?.startDateTime)
    || formData.endDateTime !== toInputValue(event?.endDateTime)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const common = {
      name: formData.name,
      description: formData.description,
      startDateTime: fromInputValue(formData.startDateTime),
      endDateTime: fromInputValue(formData.endDateTime),
      gameName: formData.gameName,
      url: formData.url || undefined,
      price: formData.price ? parseFloat(formData.price) : undefined,
      maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants, 10) : undefined,
      participantsVisibility: formData.participantsVisibility,
    };

    try {
      if (event) {
        const result = await updateEventDetailsAction({
          ...common,
          eventId: event.id,
          banner: formData.banner || null,
          lairId: formData.lairId || null,
        });
        if (result.success) {
          router.push(`/events/${event.id}`);
          router.refresh();
        } else {
          setError(result.error || t("form.errors.generic"));
        }
        return;
      }

      const result = await createEventAction({
        ...common,
        banner: formData.banner || undefined,
        lairId: formData.lairId || undefined,
        preRegistration: formData.preRegistration,
        allowJoin: formData.allowJoin,
      });

      if (result.success) {
        // Le rattachement est le but de la manœuvre : s'il échoue, on le dit et
        // on reste sur place, sinon l'organisateur croirait son tournoi daté.
        if (linkTournament && result.eventId) {
          const link = await fetch(`/api/tournaments/${linkTournament.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: result.eventId }),
          });
          if (!link.ok) {
            const body = await link.json().catch(() => ({}));
            setError(body.error ?? t("form.errors.generic"));
            return;
          }
          router.push(`/tournaments/${linkTournament.id}/organizer/settings`);
          router.refresh();
          return;
        }
        router.push(`/events/${result.eventId}`);
        router.refresh();
      } else {
        setError(result.error || t("form.errors.generic"));
      }
    } catch (err) {
      console.error(err);
      setError(isEdit ? t("form.errors.updateFailed") : t("form.errors.createFailed"));
    } finally {
      setLoading(false);
    }
  };

  const previewStart = formData.startDateTime
    ? DateTime.fromISO(formData.startDateTime).setLocale(locale)
    : null;

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FormSection
            title={t("form.fields.banner.label")}
            aside={<span className="text-xs text-muted-foreground">{t("form.fields.banner.help")}</span>}
          >
            <BannerField
              value={formData.banner}
              fallback={selectedGame?.banner}
              onChange={(banner) => update({ banner })}
            />
          </FormSection>

          <FormSection title={t("form.sections.information")}>
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                {t("form.fields.name.label")}
              </label>
              <Input
                id="name"
                required
                maxLength={500}
                value={formData.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder={t("form.fields.name.placeholder")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="gameName" className="text-sm font-medium">
                  {t("form.fields.game.label")}
                </label>
                <Select value={formData.gameName} onValueChange={(value) => update({ gameName: value })}>
                  <SelectTrigger id="gameName" className="w-full">
                    <SelectValue placeholder={t("form.fields.game.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {games.map((game) => (
                      <SelectItem key={game.id} value={game.name}>
                        {game.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {lairOptions.length > 0 && (
                <div className="space-y-2">
                  <label htmlFor="lairId" className="text-sm font-medium">
                    {t("form.fields.lair.label")}
                  </label>
                  <Select
                    value={formData.lairId || NO_LAIR}
                    onValueChange={(value) => update({ lairId: value === NO_LAIR ? "" : value })}
                  >
                    <SelectTrigger id="lairId" className="w-full">
                      <SelectValue placeholder={t("form.fields.lair.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LAIR}>{t("form.fields.lair.placeholder")}</SelectItem>
                      {lairOptions.map((lair) => (
                        <SelectItem key={lair.id} value={lair.id}>
                          {lair.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="startDateTime" className="text-sm font-medium">
                  {t("form.fields.startDate.label")}
                </label>
                <Input
                  id="startDateTime"
                  type="datetime-local"
                  required
                  value={formData.startDateTime}
                  onChange={(e) => update({ startDateTime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="endDateTime" className="text-sm font-medium">
                  {t("form.fields.endDate.label")}
                </label>
                <Input
                  id="endDateTime"
                  type="datetime-local"
                  required
                  value={formData.endDateTime}
                  onChange={(e) => update({ endDateTime: e.target.value })}
                />
              </div>
            </div>
            {lairOptions.length > 0 && !formData.lairId && (
              <p className="text-xs text-muted-foreground">{t("form.fields.lair.help")}</p>
            )}

            <div className="space-y-2">
              <label htmlFor="url" className="text-sm font-medium">
                {t("form.fields.url.label")}
              </label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => update({ url: e.target.value })}
                placeholder={t("form.fields.url.placeholder")}
              />
            </div>
          </FormSection>

          <FormSection
            title={t("form.fields.description.label")}
            aside={
              <div role="tablist" aria-label={t("form.fields.description.label")} className="flex gap-0.5 rounded-lg border p-0.5">
                {(["write", "preview"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={descriptionTab === tab}
                    onClick={() => setDescriptionTab(tab)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                      descriptionTab === tab ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(`form.fields.description.${tab}`)}
                  </button>
                ))}
              </div>
            }
          >
            {descriptionTab === "write" ? (
              <div className="space-y-1.5">
                <Textarea
                  id="description"
                  aria-label={t("form.fields.description.label")}
                  rows={8}
                  maxLength={10000}
                  value={formData.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder={t("form.fields.description.placeholder")}
                  className="min-h-40 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">{t("form.fields.description.help")}</p>
              </div>
            ) : (
              <div className="min-h-40 rounded-md border px-4 py-3">
                {formData.description.trim() ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{formData.description}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("form.fields.description.empty")}</p>
                )}
              </div>
            )}
          </FormSection>

          <FormSection title={t("form.sections.registration")}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="price" className="text-sm font-medium">
                  {t("form.fields.price.label")}
                </label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => update({ price: e.target.value })}
                  placeholder={t("form.fields.price.placeholder")}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="maxParticipants" className="text-sm font-medium">
                  {t("form.fields.maxParticipants.label")}
                </label>
                <Input
                  id="maxParticipants"
                  type="number"
                  min={Math.max(1, event?.registeredCount ?? 1)}
                  value={formData.maxParticipants}
                  onChange={(e) => update({ maxParticipants: e.target.value })}
                  placeholder={t("form.fields.maxParticipants.placeholder")}
                />
                <p className="text-xs text-muted-foreground">{t("form.fields.maxParticipants.help")}</p>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{t("form.fields.visibility.label")}</legend>
              {PARTICIPANTS_VISIBILITIES.map((visibility) => (
                <label key={visibility} className="flex items-start gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="participantsVisibility"
                    value={visibility}
                    checked={formData.participantsVisibility === visibility}
                    onChange={() => update({ participantsVisibility: visibility })}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    {t(`form.fields.visibility.${visibility}`)}
                    {visibility === "public" && (
                      <span className="text-muted-foreground"> — {t("form.fields.visibility.publicHelp")}</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>

            {!isEdit && (
              <div className="space-y-3 border-t pt-4">
                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.allowJoin}
                    onChange={(e) => update({ allowJoin: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  {t("form.fields.allowJoin.label")}
                </label>
                <div>
                  <label className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.preRegistration}
                      onChange={(e) => update({ preRegistration: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                    {t("form.fields.preRegistration.label")}
                  </label>
                  <p className="ml-6.5 mt-1 text-xs text-muted-foreground">{t("form.fields.preRegistration.help")}</p>
                </div>
              </div>
            )}
          </FormSection>

          {scheduleChanged && (event?.registeredCount ?? 0) > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t("form.edit.scheduleNotice", { count: event?.registeredCount ?? 0 })}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <aside className="space-y-2 lg:sticky lg:top-20 lg:w-72 lg:shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("form.preview.title")}
          </p>
          <div className="overflow-hidden rounded-xl border bg-card">
            <EventBanner src={previewBanner} alt="" className="rounded-none border-0" />
            <div className="space-y-0.5 px-3.5 py-3">
              {previewStart?.isValid && (
                <p className="text-xs font-semibold uppercase text-primary">
                  {previewStart.toFormat("ccc d LLL · HH:mm")}
                </p>
              )}
              <p className="font-semibold">{formData.name || t("form.preview.unnamed")}</p>
              <p className="text-sm text-muted-foreground">
                {[
                  lairOptions.find((lair) => lair.id === formData.lairId)?.name,
                  formData.gameName,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("form.preview.help")}</p>
        </aside>
      </div>

      <div className="sticky bottom-3 z-30 mt-6 rounded-xl border bg-background/95 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="mr-auto text-sm text-muted-foreground">
            {isEdit ? t("form.edit.hint") : t("form.hint")}
          </p>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
            {t("form.actions.cancel")}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading
              ? (isEdit ? t("form.edit.saving") : t("form.actions.creating"))
              : (isEdit ? t("form.edit.save") : t("form.actions.create"))}
          </Button>
        </div>
      </div>
    </form>
  );
}

function FormSection({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Le choix de la bannière : un dépôt sur `/api/events/banner`, dont l'adresse
 * rendue part avec le formulaire. Rien n'est inscrit sur l'événement avant
 * l'enregistrement.
 */
function BannerField({
  value,
  fallback,
  onChange,
}: {
  value: string;
  fallback?: string;
  onChange: (banner: string) => void;
}) {
  const t = useTranslations("EventCreate.form.fields.banner");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/events/banner", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        setError(data.error ?? t("error"));
        return;
      }
      onChange(data.url);
    } catch (err) {
      console.error(err);
      setError(t("error"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {value ? (
        <>
          <EventBanner src={value} alt={t("current")}>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </EventBanner>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {t("replace")}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange("")} className="text-destructive">
              {t("remove")}
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex aspect-[3/1] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-accent/40"
          )}
        >
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : (
            <ImageIcon className="h-7 w-7 text-primary" />
          )}
          <span className="font-medium">
            {uploading ? t("uploading") : t("drop")}
          </span>
          <span className="text-xs text-muted-foreground">
            {fallback ? t("fallbackGame") : t("fallback")}
          </span>
        </button>
      )}
    </div>
  );
}
