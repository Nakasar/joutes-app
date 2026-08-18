"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { buildCardId, buildPrintingId } from "@/lib/constants/card-ids";
import type { CardPrinting } from "@/lib/types/card";
import type {
  CardAttributeField,
  CardAttributeFieldType,
  CardAttributeValue,
  GameCardDetail,
} from "@/lib/db/cards";
import { checkCardIdAvailability, createGameCard, updateGameCard } from "./actions";

type Props = {
  gameId: string;
  gameName: string;
  gameSlug?: string;
  attributeFields: CardAttributeField[];
  /** Carte en cours de modification ; absente, le formulaire crée une carte. */
  card?: GameCardDetail;
};

type CustomAttribute = { key: string; type: CardAttributeFieldType; value: string | boolean };

type Availability = "idle" | "checking" | "free" | "taken";

const ATTRIBUTE_TYPE_LABELS: Record<CardAttributeFieldType, string> = {
  string: "Texte",
  number: "Nombre",
  boolean: "Oui / non",
  list: "Liste",
};

const inputClass =
  "w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent";

/** Une valeur saisie -> la valeur stockée, selon le type du champ. `null` = champ laissé vide. */
function toAttributeValue(type: CardAttributeFieldType, raw: string | boolean): CardAttributeValue | null {
  if (type === "boolean") {
    return raw === true || raw === "true" ? true : null;
  }
  const value = String(raw).trim();
  if (!value) {
    return null;
  }
  if (type === "number") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (type === "list") {
    const items = value.split(",").map((item) => item.trim()).filter(Boolean);
    return items.length > 0 ? items : null;
  }
  return value;
}

/** Une valeur stockée -> sa saisie dans le formulaire. */
function toFormValue(value: CardAttributeValue): string | boolean {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function attributeTypeOf(value: CardAttributeValue): CardAttributeFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  return "string";
}

export default function CardForm({ gameId, gameName, gameSlug, attributeFields, card }: Props) {
  const router = useRouter();
  const isEdit = Boolean(card);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [setCode, setSetCode] = useState(card?.setCode ?? "");
  const [collectorNumber, setCollectorNumber] = useState(card?.collectorNumber ?? "");
  const [cardId, setCardId] = useState(card?.id ?? "");
  // En édition, l'identifiant est celui de la carte : il n'est pas redéduit
  // tant que l'admin ne le remet pas explicitement en phase.
  const [cardIdTouched, setCardIdTouched] = useState(isEdit);
  const [name, setName] = useState(card?.name ?? "");
  const [lang, setLang] = useState(card?.lang ?? "en");
  const [image, setImage] = useState(card?.image ?? "");
  const [text, setText] = useState(card?.text ?? "");
  const [foil, setFoil] = useState(card?.foil === true);
  const [printings, setPrintings] = useState<CardPrinting[]>(card?.printings ?? []);
  const [availability, setAvailability] = useState<Availability>("idle");

  const knownKeys = useMemo(() => new Set(attributeFields.map((field) => field.key)), [attributeFields]);

  const [attributes, setAttributes] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      Object.entries(card?.attributes ?? {})
        .filter(([key]) => knownKeys.has(key))
        .map(([key, value]) => [key, toFormValue(value)])
    )
  );

  // Les attributs de la carte absents des champs relevés (jeu hétérogène, champ
  // propre à cette carte) restent éditables comme attributs libres.
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>(() =>
    Object.entries(card?.attributes ?? {})
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, value]) => ({ key, type: attributeTypeOf(value), value: toFormValue(value) }))
  );

  const derivedId = useMemo(
    () => buildCardId(gameSlug, setCode, collectorNumber),
    [gameSlug, setCode, collectorNumber]
  );
  const effectiveId = cardIdTouched ? cardId.trim() : derivedId;

  // Vérification à la saisie : l'admin voit tout de suite qu'un identifiant est
  // déjà pris, sans attendre l'échec de l'envoi (qui reste la vérification
  // faisant foi, côté serveur).
  const checkSequence = useRef(0);
  useEffect(() => {
    if (!effectiveId) {
      setAvailability("idle");
      return;
    }

    const sequence = ++checkSequence.current;
    setAvailability("checking");
    const timeout = setTimeout(async () => {
      try {
        const { available } = await checkCardIdAvailability(gameId, effectiveId, card?.id);
        if (sequence === checkSequence.current) {
          setAvailability(available ? "free" : "taken");
        }
      } catch {
        if (sequence === checkSequence.current) {
          setAvailability("idle");
        }
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [gameId, effectiveId, card?.id]);

  const resetAfterCreate = () => {
    // Le code d'extension et la langue sont conservés : les cartes s'ajoutent
    // extension par extension.
    setCollectorNumber("");
    setCardId("");
    setCardIdTouched(false);
    setName("");
    setImage("");
    setText("");
    setFoil(false);
    setPrintings([]);
    setAttributes({});
    setCustomAttributes([]);
    setAvailability("idle");
  };

  /** Téléverse un fichier et remet son URL à l'appelant (image de la carte ou d'une variante). */
  const handleUpload = async (file: File, onUploaded: (url: string) => void) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Erreur lors de l'upload");
      }
      const data = await response.json();
      onUploaded(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload du fichier");
    } finally {
      setUploading(false);
    }
  };

  const updatePrinting = (index: number, changes: Partial<CardPrinting>) => {
    setPrintings((prev) => prev.map((printing, i) => (i === index ? { ...printing, ...changes } : printing)));
  };

  /**
   * Fige l'identifiant d'une variante dès que son nom est saisi : le renommer
   * ensuite ne doit pas le changer, sous peine de casser les exemplaires qui
   * s'y réfèrent (collection, wishlists, listes de vente).
   */
  const freezePrintingId = (index: number) => {
    setPrintings((prev) =>
      prev.map((printing, i) => {
        if (i !== index || printing.id || !printing.name.trim()) {
          return printing;
        }
        return { ...printing, id: buildPrintingId(printing.name.trim()) };
      })
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setSuccess(null);

    const payloadAttributes: Record<string, CardAttributeValue> = {};
    for (const field of attributeFields) {
      const value = toAttributeValue(field.type, attributes[field.key] ?? "");
      if (value !== null) {
        payloadAttributes[field.key] = value;
      }
    }
    for (const custom of customAttributes) {
      const key = custom.key.trim();
      if (!key) continue;
      const value = toAttributeValue(custom.type, custom.value);
      if (value !== null) {
        payloadAttributes[key] = value;
      }
    }

    const payload = {
      id: effectiveId,
      name,
      setCode,
      collectorNumber,
      lang,
      image: image || undefined,
      text: text || undefined,
      foil: foil || undefined,
      // Une variante sans nom est une ligne laissée en plan : elle n'est pas envoyée.
      printings: printings
        .filter((printing) => printing.name.trim())
        .map((printing) => ({
          id: printing.id || buildPrintingId(printing.name),
          name: printing.name.trim(),
          foil: printing.foil || undefined,
          image: printing.image || undefined,
        })),
      attributes: payloadAttributes,
    };

    startTransition(async () => {
      const result = card
        ? await updateGameCard(gameId, card.id, payload)
        : await createGameCard(gameId, payload);

      if (!result.success) {
        setError(result.error ?? "Erreur lors de l'enregistrement de la carte");
        return;
      }

      setWarning(result.warning ?? null);
      if (card) {
        setSuccess(`Carte « ${result.cardId} » modifiée.`);
        if (result.cardId && result.cardId !== card.id) {
          router.replace(`/admin/cards?gameId=${gameId}&cardId=${encodeURIComponent(result.cardId)}`);
        } else {
          router.refresh();
        }
      } else {
        setSuccess(`Carte « ${result.cardId} » ajoutée à ${gameName}.`);
        resetAfterCreate();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg shadow-md p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          {card ? `Modifier la carte ${card.id}` : `Nouvelle carte — ${gameName}`}
        </h2>
        {card && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 ${
                card.source === "manual" ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "bg-muted text-muted-foreground"
              }`}
            >
              {card.source === "manual" ? "Ajoutée manuellement" : "Importée"}
            </span>
            {card.manuallyEditedAt && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                Modifiée manuellement le{" "}
                {DateTime.fromISO(card.manuallyEditedAt).setLocale("fr").toLocaleString(DateTime.DATE_MED)}
              </span>
            )}
            <a href={`/admin/cards?gameId=${gameId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
              Ajouter une carte
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Code d&apos;extension</label>
          <input
            type="text"
            required
            value={setCode}
            onChange={(e) => setSetCode(e.target.value.toUpperCase())}
            placeholder="SFD"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Numéro de collection</label>
          <input
            type="text"
            required
            value={collectorNumber}
            onChange={(e) => setCollectorNumber(e.target.value)}
            placeholder="125"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Langue</label>
          <input
            type="text"
            required
            value={lang}
            onChange={(e) => setLang(e.target.value.toLowerCase())}
            placeholder="en"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Identifiant de la carte</label>
        <input
          type="text"
          required
          value={effectiveId}
          onChange={(e) => {
            setCardIdTouched(true);
            setCardId(e.target.value);
          }}
          className={`${inputClass} font-mono`}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            Déduit du code d&apos;extension et du numéro de collection ; modifiable si besoin.
          </span>
          {cardIdTouched && derivedId && derivedId !== effectiveId && (
            <button
              type="button"
              onClick={() => {
                // Remettre l'identifiant en phase, y compris pour les
                // modifications suivantes du code d'extension et du numéro.
                setCardIdTouched(false);
                setCardId("");
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Utiliser « {derivedId} »
            </button>
          )}
          {availability === "checking" && <span className="text-muted-foreground">Vérification…</span>}
          {availability === "free" && <span className="text-emerald-600 dark:text-emerald-400">Identifiant disponible.</span>}
          {availability === "taken" && (
            <span className="text-destructive">Une carte « {effectiveId} » existe déjà pour ce jeu.</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Nom</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Image</label>
        <div className="space-y-2">
          <input
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file, setImage);
            }}
            className={inputClass}
          />
          {uploading && <p className="text-sm text-muted-foreground">Upload en cours…</p>}
          {image && !uploading && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Aperçu de la carte" className="h-40 w-auto rounded border object-contain" />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Texte de la carte</label>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
          Carte toujours foil
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          À cocher pour une carte qui n&apos;existe qu&apos;en foil : elle est alors affichée comme telle partout.
        </p>
      </div>

      <div className="pt-4 border-t space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Variantes d&apos;impression</h3>
          <p className="text-xs text-muted-foreground">
            Tirages d&apos;une même carte (version normale, foil, promo pack, pre-release, judge…). L&apos;image est
            facultative : sans elle, la variante reprend l&apos;illustration de la carte.
          </p>
        </div>

        <div className="space-y-3">
          {printings.map((printing, index) => (
            <div key={index} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={printing.name}
                  placeholder="Nom de la variante (Promo Pack Nexus…)"
                  onChange={(e) => updatePrinting(index, { name: e.target.value })}
                  onBlur={() => freezePrintingId(index)}
                  className={`${inputClass} flex-1 min-w-[14rem]`}
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={printing.foil === true}
                    onChange={(e) => updatePrinting(index, { foil: e.target.checked })}
                  />
                  Foil
                </label>
                <button
                  type="button"
                  onClick={() => setPrintings((prev) => prev.filter((_, i) => i !== index))}
                  className="text-sm text-destructive hover:text-destructive/80"
                >
                  Retirer
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={printing.image ?? ""}
                  placeholder="Image de la variante (facultative)"
                  onChange={(e) => updatePrinting(index, { image: e.target.value })}
                  className={`${inputClass} flex-1 min-w-[14rem]`}
                />
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(file, (url) => updatePrinting(index, { image: url }));
                  }}
                  className={`${inputClass} w-64`}
                />
              </div>
              {printing.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={printing.image}
                  alt={`Aperçu de la variante ${printing.name}`}
                  className="h-28 w-auto rounded border object-contain"
                />
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setPrintings((prev) => [...prev, { id: "", name: "" }])}
          >
            Ajouter une variante
          </Button>
        </div>
      </div>

      <div className="pt-4 border-t space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Attributs du jeu</h3>
          <p className="text-xs text-muted-foreground">
            {attributeFields.length > 0
              ? "Relevés sur les cartes existantes de ce jeu. Un champ laissé vide n'est pas enregistré ; vidé sur une carte existante, l'attribut est retiré."
              : "Aucun attribut détecté sur les cartes de ce jeu : ajoutez-les ci-dessous."}
          </p>
        </div>

        {attributeFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {attributeFields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {field.key}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {ATTRIBUTE_TYPE_LABELS[field.type].toLowerCase()}
                  </span>
                </label>
                {field.type === "boolean" ? (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={attributes[field.key] === true}
                      onChange={(e) => setAttributes((prev) => ({ ...prev, [field.key]: e.target.checked }))}
                    />
                    Oui
                  </label>
                ) : (
                  <>
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={String(attributes[field.key] ?? "")}
                      list={field.suggestions ? `attribute-${field.key}` : undefined}
                      placeholder={field.type === "list" ? "Valeurs séparées par des virgules" : undefined}
                      onChange={(e) => setAttributes((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className={inputClass}
                    />
                    {field.suggestions && (
                      <datalist id={`attribute-${field.key}`}>
                        {field.suggestions.map((suggestion) => (
                          <option key={suggestion} value={suggestion} />
                        ))}
                      </datalist>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {customAttributes.map((attribute, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={attribute.key}
                placeholder="Nom de l'attribut"
                onChange={(e) =>
                  setCustomAttributes((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, key: e.target.value } : item))
                  )
                }
                className={`${inputClass} w-48`}
              />
              <select
                value={attribute.type}
                onChange={(e) =>
                  setCustomAttributes((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, type: e.target.value as CardAttributeFieldType, value: "" } : item
                    )
                  )
                }
                className={`${inputClass} w-36`}
              >
                {Object.entries(ATTRIBUTE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {attribute.type === "boolean" ? (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={attribute.value === true}
                    onChange={(e) =>
                      setCustomAttributes((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, value: e.target.checked } : item))
                      )
                    }
                  />
                  Oui
                </label>
              ) : (
                <input
                  type={attribute.type === "number" ? "number" : "text"}
                  value={String(attribute.value)}
                  placeholder={attribute.type === "list" ? "Valeurs séparées par des virgules" : "Valeur"}
                  onChange={(e) =>
                    setCustomAttributes((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, value: e.target.value } : item))
                    )
                  }
                  className={`${inputClass} flex-1 min-w-[12rem]`}
                />
              )}
              <button
                type="button"
                onClick={() => setCustomAttributes((prev) => prev.filter((_, i) => i !== index))}
                className="text-sm text-destructive hover:text-destructive/80"
              >
                Retirer
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setCustomAttributes((prev) => [...prev, { key: "", type: "string", value: "" }])}
          >
            Ajouter un attribut
          </Button>
        </div>
      </div>

      {/*
        Barre d'action collée au bas de la fenêtre : le formulaire est long, et
        le bouton comme le compte rendu de l'enregistrement doivent rester
        atteignables sans remonter en haut de page.
      */}
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t bg-card/95 px-6 py-4 backdrop-blur">
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          {error && <p className="text-destructive">{error}</p>}
          {success && <p className="text-emerald-600 dark:text-emerald-400">{success}</p>}
          {warning && <p className="text-amber-700 dark:text-amber-400">{warning}</p>}
          {availability === "taken" && !error && (
            <p className="text-destructive">Une carte « {effectiveId} » existe déjà pour ce jeu.</p>
          )}
        </div>
        <Button type="submit" disabled={isPending || uploading || availability === "taken" || !effectiveId}>
          {isPending
            ? isEdit
              ? "Enregistrement…"
              : "Ajout en cours…"
            : isEdit
              ? "Enregistrer les modifications"
              : "Ajouter la carte"}
        </Button>
      </div>
    </form>
  );
}
