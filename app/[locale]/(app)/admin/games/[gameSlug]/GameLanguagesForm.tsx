"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { CARD_LANGUAGES } from "@/lib/constants/card-languages.ts";

import { setGameLanguages } from "../actions.ts";

/** L'administration est en français : les noms de langue n'ont pas besoin de passer par les traductions. */
const LANGUAGE_NAMES: Record<string, string> = {
  fr: "🇫🇷 Français",
  en: "🇬🇧 Anglais",
  zh: "🇨🇳 Chinois",
  it: "🇮🇹 Italien",
  ja: "🇯🇵 Japonais",
  ko: "🇰🇷 Coréen",
};

const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code.toUpperCase();

/**
 * Les langues dans lesquelles les cartes d'un jeu sont imprimées.
 *
 * Elles sont proposées, dans cet ordre, à la création d'un booster (la
 * première y est choisie d'office), comme filtre de la recherche de cartes et
 * à l'ajout d'un exemplaire en collection. Une langue peut être déclarée sans
 * qu'aucune carte n'ait été importée dans cette langue.
 */
export function GameLanguagesForm({
  gameId,
  initial,
  configured,
  catalogLanguages,
}: {
  gameId: string;
  /** Les langues en vigueur : celles du jeu, ou celles du catalogue recopiées. */
  initial: string[];
  /** Le jeu porte-t-il déjà sa liste, ou suit-il son catalogue ? */
  configured: boolean;
  /** Langues des cartes présentes au catalogue, rétablies par « Revenir au catalogue ». */
  catalogLanguages: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isConfigured, setIsConfigured] = useState(configured);
  const [languages, setLanguages] = useState<string[]>(initial);

  const available = CARD_LANGUAGES.filter((code) => !languages.includes(code));

  const move = (from: number, to: number) =>
    setLanguages((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  const save = (payload: string[] | null, success: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await setGameLanguages(gameId, payload);
      if (result.success) {
        setIsConfigured(payload !== null);
        if (payload === null) setLanguages(catalogLanguages);
      }
      setMessage(
        result.success
          ? { ok: true, text: success }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save(languages, "Langues enregistrées.");
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

      {!isConfigured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Ce jeu propose les langues des cartes présentes à son catalogue. Elles sont recopiées
          ci-dessous : enregistrer fige la liste sur le jeu, qui ne suivra plus les imports.
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Langues des cartes</h2>
          <p className="text-muted-foreground text-sm">
            Proposées, dans cet ordre, à la création d&apos;un booster, comme filtre de la recherche
            de cartes et à l&apos;ajout d&apos;une carte en collection. La première est choisie
            d&apos;office pour un nouveau booster. Une langue sans cartes importées affiche les
            cartes anglaises.
          </p>
        </div>

        {languages.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            Aucune langue : ajoutez-en au moins une.
          </p>
        ) : (
          <ul className="space-y-2">
            {languages.map((code, index) => {
              const name = languageName(code);
              return (
                <li
                  key={code}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex-1 text-sm text-foreground">{name}</span>
                  {!catalogLanguages.includes(code) && (
                    <span className="text-muted-foreground text-xs">Aucune carte importée</span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      aria-label={`Monter ${name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={index === languages.length - 1}
                      onClick={() => move(index, index + 1)}
                      aria-label={`Descendre ${name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguages(languages.filter((other) => other !== code))}
                      aria-label={`Retirer ${name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {available.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {available.map((code) => (
              <Button
                key={code}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLanguages([...languages, code])}
              >
                <Plus className="size-4" aria-hidden />
                {languageName(code)}
              </Button>
            ))}
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Retirer une langue ne touche pas aux boosters ni aux exemplaires qui la portent déjà.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || languages.length === 0}>
          {isPending ? "Enregistrement…" : "Enregistrer les langues"}
        </Button>
        {isConfigured && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => save(null, "Le jeu propose de nouveau les langues de son catalogue.")}
          >
            Revenir au catalogue
          </Button>
        )}
      </div>
    </form>
  );
}
