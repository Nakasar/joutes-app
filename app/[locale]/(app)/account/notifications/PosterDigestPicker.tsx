'use client';

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Button } from "@/components/ui/button.tsx";
import { updatePosterDigestAction } from "@/app/[locale]/(app)/account/actions.ts";

type Choice = { ref: string; name: string; kind: "poster" | "lair" };

/**
 * Le choix des affiches envoyées chaque lundi en message privé Discord.
 *
 * La sélection se garde côté client jusqu'à « Enregistrer » : cocher trois
 * affiches ne doit pas faire trois allers-retours, ni envoyer un état
 * intermédiaire. Le serveur rend la sélection réellement retenue.
 */
export function PosterDigestPicker({ choices, initialRefs, max }: {
  choices: Choice[];
  initialRefs: string[];
  max: number;
}) {
  const t = useTranslations("Account.notifications.posterDigest");
  const [selected, setSelected] = useState<string[]>(initialRefs);
  const [saved, setSaved] = useState<string[]>(initialRefs);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = selected.length !== saved.length || selected.some((ref) => !saved.includes(ref));

  const toggle = (ref: string, checked: boolean) => {
    setMessage(null);
    setSelected((current) =>
      checked ? (current.includes(ref) || current.length >= max ? current : [...current, ref]) : current.filter((r) => r !== ref)
    );
  };

  const save = () => {
    startTransition(async () => {
      const result = await updatePosterDigestAction(selected);
      if (result.success && result.refs) {
        setSelected(result.refs);
        setSaved(result.refs);
        setMessage({ kind: "ok", text: result.refs.length > 0 ? t("saved", { count: result.refs.length }) : t("disabled") });
      } else {
        setMessage({ kind: "error", text: result.error ?? t("error") });
      }
    });
  };

  if (choices.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("pick", { max })}</p>
      <ul className="space-y-2">
        {choices.map((choice) => {
          const checked = selected.includes(choice.ref);
          const id = `poster-digest-${choice.ref.replace(":", "-")}`;
          return (
            <li key={choice.ref} className="flex items-center gap-3">
              <Checkbox
                id={id}
                checked={checked}
                disabled={isPending || (!checked && selected.length >= max)}
                onCheckedChange={(value) => toggle(choice.ref, value === true)}
              />
              <label htmlFor={id} className="text-sm">
                {choice.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {choice.kind === "poster" ? t("kindPoster") : t("kindLair")}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={isPending || !dirty}>
          {isPending ? t("saving") : t("save")}
        </Button>
        {message && (
          <span className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
