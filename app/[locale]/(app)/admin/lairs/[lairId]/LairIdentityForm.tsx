"use client";

import { useState, useTransition } from "react";
import { Lair } from "@/lib/types/Lair.ts";
import { Button } from "@/components/ui/button.tsx";
import { updateLairIdentity } from "../actions.ts";

const FIELD_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

/**
 * Identité d'un lieu.
 *
 * Les coordonnées se saisissent « latitude, longitude » — l'ordre où on les
 * copie depuis une carte — et repartent en GeoJSON, qui les attend dans
 * l'autre sens. L'inversion reste ici plutôt que chez l'appelant : c'est
 * l'erreur la plus facile à commettre, autant qu'elle n'ait qu'un seul endroit
 * où se produire.
 */
export function LairIdentityForm({ lair }: { lair: Lair }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: lair.name,
    banner: lair.banner ?? "",
    address: lair.address ?? "",
    website: lair.website ?? "",
    coordinates: lair.location
      ? `${lair.location.coordinates[1]}, ${lair.location.coordinates[0]}`
      : "",
  });

  const upload = async (file: File) => {
    setUploading(true);
    setMessage(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });

      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error || "Erreur lors de l'upload");
      }

      const data = await response.json();
      setForm((previous) => ({ ...previous, banner: data.url }));
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Erreur lors de l'upload du fichier",
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const data: Parameters<typeof updateLairIdentity>[1] = {
      name: form.name,
      banner: form.banner.length > 0 ? form.banner : undefined,
    };

    if (form.coordinates.trim().length > 0) {
      const parts = form.coordinates.split(",").map((part) => part.trim());

      if (parts.length !== 2) {
        setMessage({ ok: false, text: "Coordonnées : attendu « latitude, longitude »." });
        return;
      }

      const latitude = Number.parseFloat(parts[0]);
      const longitude = Number.parseFloat(parts[1]);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setMessage({ ok: false, text: "Coordonnées : les deux valeurs doivent être des nombres." });
        return;
      }

      data.location = { type: "Point", coordinates: [longitude, latitude] };
    }

    if (form.address.trim().length > 0) data.address = form.address.trim();
    if (form.website.trim().length > 0) data.website = form.website.trim();

    startTransition(async () => {
      const result = await updateLairIdentity(lair.id, data);

      setMessage(
        result.success
          ? { ok: true, text: "Identité enregistrée." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Identité</h2>
          <p className="text-sm text-muted-foreground">
            Le nom du lieu, et de quoi le trouver.
          </p>
        </div>

        <div>
          <label htmlFor="lair-name" className="block text-sm font-medium text-foreground mb-1">
            Nom du lieu
          </label>
          <input
            id="lair-name"
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="lair-address" className="block text-sm font-medium text-foreground mb-1">
            Adresse (optionnel)
          </label>
          <input
            id="lair-address"
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="123 rue de la Joute, 75001 Paris"
            className={FIELD_CLASS}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lair-website" className="block text-sm font-medium text-foreground mb-1">
              Site web (optionnel)
            </label>
            <input
              id="lair-website"
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://exemple.com"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="lair-gps" className="block text-sm font-medium text-foreground mb-1">
              Coordonnées GPS (optionnel)
            </label>
            <input
              id="lair-gps"
              type="text"
              value={form.coordinates}
              onChange={(e) => setForm({ ...form, coordinates: e.target.value })}
              placeholder="48.8566, 2.3522"
              className={`${FIELD_CLASS} font-mono`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format : latitude, longitude (exemple : 48.8566, 2.3522 pour Paris).
            </p>
          </div>
        </div>
      </section>

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Bannière</h2>
          <p className="text-sm text-muted-foreground">Affichée en tête de la vitrine du lieu.</p>
        </div>

        <input
          type="file"
          accept="image/*"
          aria-label="Bannière du lieu"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          disabled={uploading}
          className={FIELD_CLASS}
        />
        {uploading && <p className="text-sm text-muted-foreground">Upload en cours...</p>}
        {form.banner && !uploading && (
          <div className="flex flex-wrap items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.banner} alt="Bannière" className="w-48 h-24 object-cover rounded" />
            <button
              type="button"
              onClick={() => setForm({ ...form, banner: "" })}
              className="text-sm text-destructive hover:text-destructive/80"
            >
              Supprimer
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || uploading}>
          {isPending ? "Enregistrement…" : "Enregistrer l'identité"}
        </Button>
      </div>
    </form>
  );
}
