"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button.tsx";
import { buildProductId } from "@/lib/constants/product-ids.ts";
import { PRODUCT_KIND_OPTIONS } from "@/lib/constants/product-kinds.ts";
import { MAX_PRODUCT_CONTENTS } from "@/lib/schemas/product.schema.ts";
import type { CardAttributeFieldType, CardAttributeValue } from "@/lib/db/cards.ts";
import type { GameProductDetail, GameProductSummary, ProductAttributeField } from "@/lib/db/products.ts";
import type { ProductContent } from "@/lib/types/product.ts";
import ProductContentsEditor from "./ProductContentsEditor.tsx";
import { checkProductIdAvailability, createGameProduct, deleteGameProduct, updateGameProduct } from "./actions.ts";

type Props = {
  gameId: string;
  gameName: string;
  attributeFields: ProductAttributeField[];
  /** Produit en cours de modification ; absent, le formulaire crée un produit. */
  product?: GameProductDetail;
  /** Produits composant le contenu, pour les afficher par leur nom. */
  contentProducts?: GameProductSummary[];
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

export default function ProductForm({ gameId, gameName, attributeFields, product, contentProducts }: Props) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(product?.name ?? "");
  const [kind, setKind] = useState(product?.kind ?? "unit");
  const [setCode, setSetCode] = useState(product?.setCode ?? "");
  const [productId, setProductId] = useState(product?.id ?? "");
  // En édition, l'identifiant est figé : il n'est jamais redéduit du nom.
  const [productIdTouched, setProductIdTouched] = useState(isEdit);
  const [image, setImage] = useState(product?.image ?? "");
  const [contents, setContents] = useState<ProductContent[]>(product?.contents ?? []);
  const [availability, setAvailability] = useState<Availability>("idle");

  const knownKeys = useMemo(() => new Set(attributeFields.map((field) => field.key)), [attributeFields]);

  const [attributes, setAttributes] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      Object.entries(product?.attributes ?? {})
        .filter(([key]) => knownKeys.has(key))
        .map(([key, value]) => [key, toFormValue(value)])
    )
  );

  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>(() =>
    Object.entries(product?.attributes ?? {})
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, value]) => ({ key, type: attributeTypeOf(value), value: toFormValue(value) }))
  );

  const derivedId = useMemo(() => buildProductId(setCode, name), [setCode, name]);
  const effectiveId = productIdTouched ? productId.trim() : derivedId;

  // Vérification à la saisie, comme pour les cartes : l'admin voit tout de suite
  // qu'un identifiant est pris, sans attendre l'échec de l'envoi (qui reste la
  // vérification faisant foi, côté serveur).
  const checkSequence = useRef(0);
  useEffect(() => {
    if (isEdit || !effectiveId) {
      setAvailability("idle");
      return;
    }

    const sequence = ++checkSequence.current;
    setAvailability("checking");
    const timeout = setTimeout(async () => {
      try {
        const { available } = await checkProductIdAvailability(gameId, effectiveId);
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
  }, [gameId, effectiveId, isEdit]);

  const resetAfterCreate = () => {
    // La gamme et le type sont conservés : les produits s'ajoutent vague par vague.
    setName("");
    setProductId("");
    setProductIdTouched(false);
    setImage("");
    setContents([]);
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
      kind,
      setCode: setCode || undefined,
      image: image || undefined,
      contents,
      attributes: payloadAttributes,
    };

    startTransition(async () => {
      const result = product
        ? await updateGameProduct(gameId, product.id, payload)
        : await createGameProduct(gameId, payload);

      if (!result.success) {
        setError(result.error ?? "Erreur lors de l'enregistrement du produit");
        return;
      }

      if (product) {
        setSuccess(`Produit « ${result.productId} » modifié.`);
        router.refresh();
      } else {
        setSuccess(`Produit « ${result.productId} » ajouté à ${gameName}.`);
        resetAfterCreate();
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    if (!product) return;
    if (!confirm(`Supprimer définitivement « ${product.name} » ?`)) return;

    startTransition(async () => {
      const result = await deleteGameProduct(gameId, product.id);
      if (!result.success) {
        setError(result.error ?? "Erreur lors de la suppression du produit");
        return;
      }
      router.replace(`/admin/products?gameId=${gameId}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg shadow-md p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          {product ? `Modifier le produit ${product.id}` : `Nouveau produit — ${gameName}`}
        </h2>
        {product && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {product.manuallyEditedAt && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                Modifié le{" "}
                {DateTime.fromISO(product.manuallyEditedAt).setLocale("fr").toLocaleString(DateTime.DATE_MED)}
              </span>
            )}
            <a href={`/admin/products?gameId=${gameId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
              Ajouter un produit
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">Nom</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spearhead: Stormstrike"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Gamme</label>
          <input
            type="text"
            value={setCode}
            onChange={(e) => setSetCode(e.target.value.toUpperCase())}
            placeholder="AOS4"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={inputClass}
          >
            {PRODUCT_KIND_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">Identifiant</label>
          <input
            type="text"
            required
            value={effectiveId}
            disabled={isEdit}
            onChange={(e) => {
              setProductIdTouched(true);
              setProductId(e.target.value);
            }}
            className={`${inputClass} font-mono disabled:opacity-60`}
          />
          {isEdit ? (
            <p className="mt-1 text-xs text-muted-foreground">
              L&apos;identifiant est figé : les exemplaires en collection et le contenu des autres produits
              s&apos;y réfèrent.
            </p>
          ) : (
            <p className="mt-1 text-xs">
              {availability === "checking" && <span className="text-muted-foreground">Vérification…</span>}
              {availability === "free" && <span className="text-emerald-600 dark:text-emerald-400">Disponible.</span>}
              {availability === "taken" && (
                <span className="text-destructive">Cet identifiant est déjà pris pour ce jeu.</span>
              )}
              {availability === "idle" && (
                <span className="text-muted-foreground">Déduit de la gamme et du nom, modifiable.</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Image</label>
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
        {uploading && <p className="mt-1 text-sm text-muted-foreground">Upload en cours…</p>}
        {image && !uploading && (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-24 w-24 rounded object-cover" />
            <button
              type="button"
              onClick={() => setImage("")}
              className="text-sm text-destructive hover:underline"
            >
              Retirer
            </button>
          </div>
        )}
      </div>

      <ProductContentsEditor
        gameId={gameId}
        currentProductId={product?.id}
        contents={contents}
        onChange={setContents}
        maxLines={MAX_PRODUCT_CONTENTS}
        knownProducts={contentProducts}
      />

      {attributeFields.length > 0 && (
        <div className="space-y-3 rounded-lg border border-input p-4">
          <p className="text-sm font-medium text-foreground">Attributs du jeu</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {attributeFields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm text-foreground mb-1">
                  {field.key}
                  <span className="ml-1 text-xs text-muted-foreground">({ATTRIBUTE_TYPE_LABELS[field.type]})</span>
                </label>
                {field.type === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={attributes[field.key] === true}
                    onChange={(e) =>
                      setAttributes((prev) => ({ ...prev, [field.key]: e.target.checked }))
                    }
                    className="size-4"
                  />
                ) : (
                  <>
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      list={field.suggestions ? `product-attr-${field.key}` : undefined}
                      value={String(attributes[field.key] ?? "")}
                      onChange={(e) => setAttributes((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className={inputClass}
                    />
                    {field.suggestions && (
                      <datalist id={`product-attr-${field.key}`}>
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
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-input p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">Attributs libres</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setCustomAttributes((prev) => [...prev, { key: "", type: "string", value: "" }])
            }
          >
            Ajouter un attribut
          </Button>
        </div>
        {customAttributes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Faction, taille de socle, points… Les attributs saisis ici sont proposés pour les produits suivants.
          </p>
        )}
        {customAttributes.map((custom, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_1fr_auto] gap-2">
            <input
              type="text"
              value={custom.key}
              onChange={(e) =>
                setCustomAttributes((prev) =>
                  prev.map((item, i) => (i === index ? { ...item, key: e.target.value } : item))
                )
              }
              placeholder="faction"
              className={inputClass}
            />
            <select
              value={custom.type}
              onChange={(e) =>
                setCustomAttributes((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, type: e.target.value as CardAttributeFieldType, value: "" } : item
                  )
                )
              }
              className={inputClass}
            >
              {Object.entries(ATTRIBUTE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {custom.type === "boolean" ? (
              <input
                type="checkbox"
                checked={custom.value === true}
                onChange={(e) =>
                  setCustomAttributes((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, value: e.target.checked } : item))
                  )
                }
                className="size-4 self-center"
              />
            ) : (
              <input
                type={custom.type === "number" ? "number" : "text"}
                value={String(custom.value)}
                onChange={(e) =>
                  setCustomAttributes((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, value: e.target.value } : item))
                  )
                }
                className={inputClass}
              />
            )}
            <button
              type="button"
              onClick={() => setCustomAttributes((prev) => prev.filter((_, i) => i !== index))}
              className="text-sm text-destructive hover:underline"
            >
              Retirer
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || uploading || availability === "taken" || !effectiveId}>
          {product ? "Enregistrer" : "Ajouter le produit"}
        </Button>
        {product && (
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
            Supprimer
          </Button>
        )}
      </div>
    </form>
  );
}
