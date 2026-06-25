'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function CreatePlayGroupForm() {
  const t = useTranslations("PlayGroups");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/play-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossible de créer le groupe");
      }

      router.push("/play-groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">{t("page.createTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("page.createDescription")}</p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="play-group-name">{t("page.nameLabel")}</label>
          <input
            id="play-group-name"
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            placeholder={t("page.namePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="play-group-description">{t("page.descriptionLabel")}</label>
          <textarea
            id="play-group-description"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2"
            placeholder={t("page.descriptionPlaceholder")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? t("page.loading") : t("page.submit")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/play-groups">{t("page.back")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
