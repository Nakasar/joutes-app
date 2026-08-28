"use client";

import { useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { createLairAction, type CreateLairActionResult } from "./create-actions.ts";
import { MAX_PUBLIC_LAIRS_PER_OWNER } from "@/lib/lairs/creation.ts";
import LocationSearchInput from "@/components/LocationSearchInput.tsx";
import type { Place } from "@/lib/geo/places.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Plus, Loader2, AlertCircle, Lock, Globe, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils.ts";

/**
 * L'ouverture d'un lieu depuis l'annuaire — publique ou privée.
 *
 * Le même dialogue pour les deux, parce que c'est la même chose vue par le
 * joueur : « j'ajoute l'endroit où je joue ». Ce qui change tient au choix du
 * haut, et le formulaire s'ajuste — un lieu public réclame une adresse et une
 * ville, faute de quoi il ne serait trouvable ni dans l'annuaire ni par la
 * recherche autour de soi ; un lieu privé, qui ne paraît nulle part, se
 * contente d'un nom.
 *
 * Les refus arrivent en codes de l'action serveur : la traduction se fait ici,
 * seul endroit qui connaisse la langue de la page.
 */

/**
 * Les deux choix, dans l'ordre où le clavier les parcourt. Une liste, et non
 * deux `if` : c'est elle qui donne au `radiogroup` son voisin suivant et son
 * voisin précédent.
 */
const VISIBILITIES = ["public", "private"] as const;

type Visibility = (typeof VISIBILITIES)[number];

/** Les refus de l'action, et la clé qui les dit dans la langue de la page. */
const ERROR_KEYS: Record<
  Exclude<CreateLairActionResult, { success: true }>["error"],
  string
> = {
  NOT_AUTHENTICATED: "errors.notAuthenticated",
  NAME_REQUIRED: "errors.nameRequired",
  NAME_TOO_LONG: "errors.nameTooLong",
  ADDRESS_REQUIRED: "errors.addressRequired",
  ADDRESS_TOO_LONG: "errors.addressTooLong",
  LOCATION_REQUIRED: "errors.locationRequired",
  LOCATION_INVALID: "errors.locationInvalid",
  WEBSITE_INVALID: "errors.websiteInvalid",
  INVALID: "errors.invalid",
  TOO_MANY: "errors.tooMany",
  DUPLICATE: "errors.duplicate",
  FAILED: "errors.failed",
};

export default function CreateLairButton() {
  const router = useRouter();
  const t = useTranslations("Lairs.create");
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const [visibility, setVisibility] = useState<Visibility>("public");
  /**
   * Les deux boutons du choix de visibilité, pour que les flèches y déplacent
   * réellement le focus : un `radiogroup` dont on ne peut pas changer d'option
   * au clavier annonce aux lecteurs d'écran une navigation qui n'existe pas.
   */
  const visibilityRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  /**
   * Les coordonnées de la localité choisie. Détachées dès que la frappe reprend
   * dans le champ : garder celles d'une ville dont le nom n'est plus affiché
   * enregistrerait le lieu à un endroit que personne n'a demandé.
   */
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [error, setError] = useState<string | null>(null);
  /** Le lieu déjà présent que la saisie dupliquait, pour pouvoir y renvoyer. */
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const isPublic = visibility === "public";

  const reset = () => {
    setName("");
    setAddress("");
    setWebsite("");
    setPlaceQuery("");
    setLocation(null);
    setError(null);
    setDuplicate(null);
  };

  const selectVisibility = (value: Visibility) => {
    setVisibility(value);
    setError(null);
    setDuplicate(null);
  };

  /**
   * Les flèches circulent d'une option à l'autre, comme dans tout groupe de
   * boutons radio : la sélection suit le focus, et le parcours boucle.
   */
  const handleVisibilityKeyDown = (event: React.KeyboardEvent, index: number) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";

    if (!forward && !backward) {
      return;
    }

    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + VISIBILITIES.length) % VISIBILITIES.length;
    selectVisibility(VISIBILITIES[next]);
    visibilityRefs.current[next]?.focus();
  };

  const handlePlaceSelect = (place: Place) => {
    setLocation({ latitude: place.latitude, longitude: place.longitude });
    setPlaceQuery(place.label);
    setError(null);
  };

  const handlePlaceQueryChange = (value: string) => {
    setPlaceQuery(value);
    setLocation(null);
  };

  const handleCreate = () => {
    setError(null);
    setDuplicate(null);

    // Les mêmes exigences que le serveur, dites tout de suite : un aller-retour
    // pour apprendre qu'il manque le nom n'apprend rien à personne. Le serveur
    // les revérifie — c'est lui qui décide.
    if (!name.trim()) {
      setError(t("errors.nameRequired"));
      return;
    }

    if (isPublic && !address.trim()) {
      setError(t("errors.addressRequired"));
      return;
    }

    if (isPublic && !location) {
      setError(t("errors.locationRequired"));
      return;
    }

    startTransition(async () => {
      const result = await createLairAction({
        name: name.trim(),
        visibility,
        address: address.trim() || undefined,
        website: isPublic && website.trim() ? website.trim() : undefined,
        location: location ?? undefined,
      });

      if (result.success) {
        reset();
        setIsOpen(false);
        router.push(`/lairs/${result.lairId}`);
        return;
      }

      if (result.error === "DUPLICATE") {
        setDuplicate(result.duplicate);
        setError(t("errors.duplicate", { name: result.duplicate.name }));
        return;
      }

      setError(
        result.error === "TOO_MANY"
          ? t("errors.tooMany", { max: MAX_PUBLIC_LAIRS_PER_OWNER })
          : t(ERROR_KEYS[result.error])
      );
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <span>{error}</span>
              {duplicate && (
                <Link
                  href={`/lairs/${duplicate.id}`}
                  className="block font-medium underline underline-offset-4"
                >
                  {t("errors.duplicateAction")}
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("visibility.label")}</span>
            {/* Une grille, et non une rangée `flex` : deux cartes de texte
                libre côte à côte doivent pouvoir passer l'une sous l'autre sur
                un téléphone plutôt qu'élargir le dialogue. */}
            <div role="radiogroup" aria-label={t("visibility.label")} className="grid gap-3 sm:grid-cols-2">
              {VISIBILITIES.map((value, index) => {
                const selected = visibility === value;
                const Icon = value === "public" ? Globe : Lock;

                return (
                  <button
                    key={value}
                    ref={(node) => {
                      visibilityRefs.current[index] = node;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    // Un seul des deux boutons est atteint par la tabulation —
                    // celui qui est choisi. C'est ce qui fait qu'un groupe radio
                    // compte pour un arrêt, et non pour autant d'arrêts que
                    // d'options.
                    tabIndex={selected ? 0 : -1}
                    disabled={isPending}
                    onKeyDown={(event) => handleVisibilityKeyDown(event, index)}
                    onClick={() => selectVisibility(value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 shrink-0" />
                      {t(`visibility.${value}.title`)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t(`visibility.${value}.description`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {isPublic && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t("publicNotice")}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="lair-name">{t("fields.name")}</Label>
            <Input
              id="lair-name"
              placeholder={t("placeholders.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lair-address">
              {isPublic ? t("fields.address") : t("fields.addressOptional")}
            </Label>
            <Input
              id="lair-address"
              placeholder={t("placeholders.address")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isPending}
            />
          </div>

          {isPublic && (
            <>
              <div className="space-y-2">
                <Label htmlFor="lair-city">{t("fields.city")}</Label>
                <LocationSearchInput
                  id="lair-city"
                  value={placeQuery}
                  onValueChange={handlePlaceQueryChange}
                  onSelect={handlePlaceSelect}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">{t("fields.cityHint")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lair-website">{t("fields.website")}</Label>
                <Input
                  id="lair-website"
                  type="url"
                  placeholder={t("placeholders.website")}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
