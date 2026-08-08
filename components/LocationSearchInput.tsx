"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/geo/places";

/**
 * Champ de recherche d'une localité par nom de ville ou code postal, avec
 * autocomplétion.
 *
 * Écrit sans passer par `Combobox`, qui filtre une liste déjà connue : ici les
 * propositions arrivent du serveur à chaque frappe, et laisser cmdk les filtrer
 * une seconde fois n'aurait fait que masquer des résultats pertinents. Le
 * clavier et les rôles ARIA sont donc tenus à la main, faute de primitive qui
 * corresponde.
 */

/** Laisser la frappe se poser avant d'interroger le serveur. */
const DEBOUNCE_MS = 300;

/** Même seuil que la route : en deçà, la recherche ne discrimine rien. */
const MIN_QUERY_LENGTH = 2;

type LocationSearchInputProps = {
  /** Texte affiché dans le champ. Contrôlé par l'appelant. */
  value: string;
  onValueChange: (value: string) => void;
  /** Appelé quand une localité est choisie dans la liste. */
  onSelect: (place: Place) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export default function LocationSearchInput({
  value,
  onValueChange,
  onSelect,
  placeholder,
  disabled,
  id,
  className,
}: LocationSearchInputProps) {
  const t = useTranslations("Location");
  const locale = useLocale();
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listId = `${generatedId}-list`;

  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Une réponse lente ne doit pas écraser celle d'une frappe plus récente. Le
   * compteur départage : seule la dernière requête émise a le droit d'écrire.
   */
  const requestRef = useRef(0);
  /**
   * Ce que l'utilisateur vient de choisir. Sélectionner une ville remplit le
   * champ, ce qui relancerait une recherche sur le libellé retenu et rouvrirait
   * la liste sous son nez.
   */
  const selectedLabelRef = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();

    if (selectedLabelRef.current === query) return;
    selectedLabelRef.current = null;

    if (query.length < MIN_QUERY_LENGTH) {
      setPlaces([]);
      setOpen(false);
      setLoading(false);
      setFailed(false);
      return;
    }

    const generation = ++requestRef.current;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    const timer = setTimeout(() => {
      fetch(`/api/geo/places?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(locale)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data) => {
          if (generation !== requestRef.current) return;
          const found: Place[] = Array.isArray(data?.places) ? data.places : [];
          setPlaces(found);
          setHighlighted(-1);
          setOpen(true);
          setLoading(false);
        })
        .catch((error) => {
          // L'annulation est le fonctionnement normal : la frappe a continué.
          if (controller.signal.aborted || generation !== requestRef.current) return;
          console.error("Recherche de localité impossible:", error);
          setPlaces([]);
          setFailed(true);
          setOpen(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, locale]);

  // Un clic ailleurs referme la liste. Le `blur` du champ ne suffit pas : il
  // survient avant le clic sur une proposition, qui ne serait jamais reçu.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const handleSelect = useCallback(
    (place: Place) => {
      selectedLabelRef.current = place.label;
      onValueChange(place.label);
      onSelect(place);
      setOpen(false);
      setPlaces([]);
      setHighlighted(-1);
    },
    [onSelect, onValueChange]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!open || places.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % places.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? places.length - 1 : index - 1));
    } else if (event.key === "Enter" && highlighted >= 0) {
      // Uniquement quand une proposition est surlignée : sinon `Enter` doit
      // rester au formulaire qui entoure le champ.
      event.preventDefault();
      handleSelect(places[highlighted]);
    }
  };

  const showPanel = open && (places.length > 0 || failed || loading);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder ?? t("searchPlaceholder")}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (places.length > 0) setOpen(true);
        }}
      />

      {loading && (
        <Loader2
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      )}

      {showPanel && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {places.map((place, index) => (
            <li
              key={place.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                index === highlighted && "bg-accent text-accent-foreground"
              )}
              // `mousedown` plutôt que `click` : le champ perdrait le focus
              // avant que le clic n'arrive.
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(place);
              }}
              onMouseEnter={() => setHighlighted(index)}
            >
              <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{place.label}</span>
            </li>
          ))}

          {places.length === 0 && (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">
              {loading ? t("searching") : failed ? t("searchFailed") : t("noResults")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
