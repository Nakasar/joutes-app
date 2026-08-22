"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Info, Lock, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import ImageDropzone from "@/components/ImageDropzone.tsx";
import { readLinkKind, stripProtocol, MAX_USER_LINKS } from "@/lib/users/links.ts";
import type { UserShowcaseSection } from "@/lib/users/showcase.ts";
import { cn } from "@/lib/utils.ts";

import {
  setProfileVisibilityAction,
  updateIdentityAction,
  updateShowcaseAction,
  type ShowcaseError,
} from "../showcase-actions.ts";
import ShowcaseSectionsField from "./ShowcaseSectionsField.tsx";
import ShowcasePreview from "./ShowcasePreview.tsx";

export type ShowcaseFormState = {
  isPublic: boolean;
  banner?: string;
  avatar?: string;
  description: string;
  showCity: boolean;
  city?: string;
  links: { url: string; label?: string }[];
  sections: UserShowcaseSection[];
};

/**
 * L'onglet « Ma vitrine ».
 *
 * Deux gestes distincts, et c'est délibéré. L'**interrupteur de visibilité**
 * agit immédiatement : c'est le seul réglage de l'écran qui change ce que des
 * inconnus voient, et le faire attendre un « Enregistrer » qu'on peut oublier
 * serait le pire endroit pour une surprise. Tout le reste attend le bouton, et
 * « Annuler » restaure — on doit pouvoir essayer un ordre de blocs sans
 * l'engager.
 *
 * L'aperçu, lui, se recompose **en direct** sur l'état du formulaire : c'est
 * son intérêt, montrer ce qu'on n'a pas encore enregistré.
 */
export default function ShowcaseForm({
  initial,
  canUseBanner,
  planLabel,
}: {
  initial: ShowcaseFormState;
  canUseBanner: boolean;
  planLabel: string | null;
}) {
  const t = useTranslations("Account.showcase");
  const router = useRouter();

  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [state, setState] = useState(initial);
  const [newLink, setNewLink] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [isSaving, startSaving] = useTransition();
  const [isTogglingVisibility, startToggling] = useTransition();

  const isDirty = useMemo(
    () => JSON.stringify({ ...state, isPublic: initial.isPublic }) !== JSON.stringify(initial),
    [state, initial],
  );

  const errorMessage = (error: ShowcaseError) => t(`errors.${error}` as "errors.FAILED");

  const set = <K extends keyof ShowcaseFormState>(key: K, value: ShowcaseFormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const toggleVisibility = (next: boolean) => {
    setIsPublic(next);

    startToggling(async () => {
      const result = await setProfileVisibilityAction(next);

      if (!result.success) {
        setIsPublic(!next);
        toast.error(errorMessage(result.error));
        return;
      }

      router.refresh();
    });
  };

  const addLink = () => {
    const url = newLink.trim();
    if (!url) {
      return;
    }

    if (state.links.length >= MAX_USER_LINKS) {
      toast.error(t("links.tooMany", { max: MAX_USER_LINKS }));
      return;
    }

    // Le protocole est retiré à la saisie et remis ici : personne ne tape
    // « https:// » dans un champ « votre chaîne ».
    const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    set("links", [...state.links, { url: normalised }]);
    setNewLink("");
  };

  const save = () => {
    startSaving(async () => {
      const [showcase, identity] = await Promise.all([
        updateShowcaseAction({
          banner: state.banner ?? "",
          sections: state.sections.map((section) => ({
            key: section.key,
            enabled: section.enabled,
          })),
          links: state.links,
          showCity: state.showCity,
        }),
        updateIdentityAction({
          description: state.description,
          profileImage: state.avatar ?? "",
        }),
      ]);

      const failure = !showcase.success ? showcase : !identity.success ? identity : null;

      if (failure && !failure.success) {
        setIssues(failure.issues ?? {});
        toast.error(errorMessage(failure.error));
        return;
      }

      setIssues({});
      toast.success(t("saved"));
      router.refresh();
    });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* 1 — La visibilité, seule à agir immédiatement. */}
        <section
          className={cn(
            "flex flex-wrap items-center gap-4 rounded-xl border p-5 transition-colors",
            isPublic ? "border-primary/50 bg-primary/10" : "bg-muted/40",
          )}
        >
          {isPublic ? (
            <Eye className="size-5 shrink-0 text-primary" aria-hidden />
          ) : (
            <Lock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          )}

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{t("visibility.title")}</p>
            <p className="text-[13px] text-pretty text-muted-foreground">
              {isPublic ? t("visibility.publicHint") : t("visibility.privateHint")}
            </p>
          </div>

          <Switch
            checked={isPublic}
            disabled={isTogglingVisibility}
            onCheckedChange={toggleVisibility}
            aria-label={t("visibility.title")}
          />
        </section>

        {/* 2 — L'identité. */}
        <section className="flex flex-col gap-4 rounded-xl border p-5">
          <div>
            <h2 className="text-[17px] font-semibold">{t("identity.title")}</h2>
            <p className="text-[13px] text-muted-foreground">{t("identity.description")}</p>
          </div>

          <div className="flex flex-wrap items-start gap-5">
            <ImageDropzone
              value={state.avatar}
              onChange={(url) => set("avatar", url)}
              uploadUrl="/api/users/me/upload"
              extraFields={{ kind: "avatar" }}
              label={t("identity.avatarLabel")}
              labels={{ failed: t("upload.failed"), remove: t("upload.remove") }}
              className="w-[84px]"
              previewClassName="h-[84px] rounded-full"
            />

            <ImageDropzone
              value={state.banner}
              onChange={(url) => set("banner", url)}
              uploadUrl="/api/users/me/upload"
              extraFields={{ kind: "banner" }}
              label={t("identity.bannerLabel")}
              hint={t("identity.bannerHint")}
              labels={{ failed: t("upload.failed"), remove: t("upload.remove") }}
              disabled={!canUseBanner}
              className="min-w-[220px] flex-1"
              previewClassName="h-[84px]"
            />
          </div>

          {!canUseBanner && (
            <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("identity.bannerLocked")}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label htmlFor="showcase-description">{t("identity.descriptionLabel")}</Label>
              <span
                className={cn(
                  "font-mono text-[11px] text-muted-foreground",
                  state.description.length > 500 && "text-destructive",
                )}
              >
                {state.description.length} / 500
              </span>
            </div>
            <Textarea
              id="showcase-description"
              value={state.description}
              onChange={(event) => set("description", event.target.value)}
              rows={5}
              placeholder={t("identity.descriptionPlaceholder")}
            />
            {issues.description && (
              <p className="text-xs text-destructive">{issues.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("identity.showCity")}</p>
              <p className="text-[13px] text-pretty text-muted-foreground">
                {state.city
                  ? t("identity.showCityHint", { city: state.city })
                  : t("identity.showCityNoCity")}
              </p>
            </div>
            <Switch
              checked={state.showCity}
              disabled={!state.city}
              onCheckedChange={(value) => set("showCity", value)}
              aria-label={t("identity.showCity")}
            />
          </div>

          {/* Ce que le formulaire ne règle pas, et pourquoi. */}
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-[13px] text-pretty text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {planLabel
              ? t("identity.derivedWithPlan", { plan: planLabel })
              : t("identity.derived")}
          </p>
        </section>

        {/* 3 — Les blocs. */}
        <section className="flex flex-col gap-4 rounded-xl border p-5">
          <div>
            <h2 className="text-[17px] font-semibold">{t("sections.title")}</h2>
            <p className="text-[13px] text-pretty text-muted-foreground">
              {isPublic ? t("sections.description") : t("sections.privateHint")}
            </p>
          </div>

          <div className={cn(!isPublic && "opacity-60")}>
            <ShowcaseSectionsField
              sections={state.sections}
              onChange={(sections) => set("sections", sections)}
            />
          </div>
        </section>

        {/* 4 — Les liens. */}
        <section className="flex flex-col gap-4 rounded-xl border p-5">
          <div>
            <h2 className="text-[17px] font-semibold">{t("links.title")}</h2>
            <p className="text-[13px] text-pretty text-muted-foreground">{t("links.description")}</p>
          </div>

          {state.links.length > 0 && (
            <ul className="flex flex-col gap-2">
              {state.links.map((link, index) => (
                <li
                  key={`${link.url}-${index}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {readLinkKind(link.url)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {stripProtocol(link.url)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("links.remove")}
                    onClick={() =>
                      set(
                        "links",
                        state.links.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newLink}
              onChange={(event) => setNewLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addLink();
                }
              }}
              placeholder={t("links.placeholder")}
              className="min-w-[200px] flex-1"
              aria-label={t("links.placeholder")}
            />
            <Button type="button" variant="outline" onClick={addLink}>
              <Plus className="mr-2 size-4" aria-hidden />
              {t("links.add")}
            </Button>
          </div>

          {issues.links && <p className="text-xs text-destructive">{issues.links}</p>}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={isSaving || !isDirty}>
            {t("save")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setState(initial);
              setIssues({});
            }}
            disabled={isSaving || !isDirty}
          >
            {t("cancel")}
          </Button>
          {isDirty && <span className="text-[13px] text-muted-foreground">{t("unsaved")}</span>}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <ShowcasePreview
          isPublic={isPublic}
          banner={state.banner}
          avatar={state.avatar}
          sections={state.sections}
        />

        <section className="flex flex-col gap-2 rounded-xl border border-dashed p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {t("neverPublic.title")}
          </h2>
          <p className="text-[13px] text-pretty text-muted-foreground">
            {t("neverPublic.description")}
          </p>
        </section>
      </aside>
    </div>
  );
}
