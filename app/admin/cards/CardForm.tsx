"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { buildCardId } from "@/lib/constants/card-ids";
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
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

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
    setAttributes({});
    setCustomAttributes([]);
    setAvailability("idle");
  };

  const handleUpload = async (file: File) => {
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
      setImage(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload du fichier");
    } finally {
      setUploading(false);
    }
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
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {card ? `Modifier la carte ${card.id}` : `Nouvelle carte — ${gameName}`}
        </h2>
        {card && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 ${
                card.source === "manual" ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {card.source === "manual" ? "Ajoutée manuellement" : "Importée"}
            </span>
            {card.manuallyEditedAt && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                Modifiée manuellement le{" "}
                {DateTime.fromISO(card.manuallyEditedAt).setLocale("fr").toLocaleString(DateTime.DATE_MED)}
              </span>
            )}
            <a href={`/admin/cards?gameId=${gameId}`} className="text-blue-600 hover:underline">
              Ajouter une carte
            </a>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}
      {warning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">{warning}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Code d&apos;extension</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de collection</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Langue</label>
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant de la carte</label>
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
          <span className="text-gray-500">
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
              className="text-blue-600 hover:underline"
            >
              Utiliser « {derivedId} »
            </button>
          )}
          {availability === "checking" && <span className="text-gray-500">Vérification…</span>}
          {availability === "free" && <span className="text-green-600">Identifiant disponible.</span>}
          {availability === "taken" && (
            <span className="text-red-600">Une carte « {effectiveId} » existe déjà pour ce jeu.</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
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
              if (file) void handleUpload(file);
            }}
            className={inputClass}
          />
          {uploading && <p className="text-sm text-gray-500">Upload en cours…</p>}
          {image && !uploading && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Aperçu de la carte" className="h-40 w-auto rounded border object-contain" />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Texte de la carte</label>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
      </div>

      <div className="pt-4 border-t space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Attributs du jeu</h3>
          <p className="text-xs text-gray-500">
            {attributeFields.length > 0
              ? "Relevés sur les cartes existantes de ce jeu. Un champ laissé vide n'est pas enregistré ; vidé sur une carte existante, l'attribut est retiré."
              : "Aucun attribut détecté sur les cartes de ce jeu : ajoutez-les ci-dessous."}
          </p>
        </div>

        {attributeFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {attributeFields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.key}
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    {ATTRIBUTE_TYPE_LABELS[field.type].toLowerCase()}
                  </span>
                </label>
                {field.type === "boolean" ? (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
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
                <label className="flex items-center gap-2 text-sm text-gray-700">
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
                className="text-sm text-red-600 hover:text-red-700"
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

      <div className="flex justify-end pt-4 border-t">
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
