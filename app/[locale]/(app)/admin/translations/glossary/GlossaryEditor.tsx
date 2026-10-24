"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { saveGlossary } from "../actions.ts";

export type GlossaryRow = {
  en: string;
  /** Nombre de cartes qui portent le terme. */
  count: number;
  value: string;
  reminder: string;
  /** `rules` : proposé d'après les règles officielles, pas encore enregistré. */
  origin: "saved" | "rules" | "none";
};

export default function GlossaryEditor({
  gameId,
  lang,
  field,
  title,
  isKeyword,
  rows: initialRows,
}: {
  gameId: string;
  lang: string;
  field: string;
  title: string;
  isKeyword: boolean;
  rows: GlossaryRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? rows.filter((row) => row.en.toLowerCase().includes(needle) || row.value.toLowerCase().includes(needle))
      : rows;
  }, [rows, query]);

  const suggested = rows.filter((row) => row.origin === "rules").length;

  const update = (en: string, changes: Partial<Pick<GlossaryRow, "value" | "reminder">>) => {
    setRows((current) => current.map((row) => (row.en === en ? { ...row, ...changes } : row)));
    setDirty(true);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveGlossary(
        gameId,
        lang,
        field,
        rows.map((row) => ({ en: row.en, value: row.value, ...(isKeyword ? { reminder: row.reminder } : {}) }))
      );
      if (!result.success) {
        toast.error(result.error ?? "Le glossaire n'a pas pu être enregistré.");
        return;
      }
      toast.success("Glossaire enregistré.");
      setDirty(false);
      router.refresh();
    });
  };

  return (
    <section aria-label={title} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {isKeyword
              ? "Le nom du mot-clé et, s'il en a un, son texte de rappel sans parenthèses."
              : "Laissez vide un nom propre qui ne change pas : il reste affiché tel quel."}
            {suggested > 0 && ` ${suggested} proposition${suggested > 1 ? "s" : ""} tirée${suggested > 1 ? "s" : ""} des règles officielles, enregistrée${suggested > 1 ? "s" : ""} avec le reste.`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Filtrer
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Terme" className="w-52" />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-5 py-2.5 font-semibold">Anglais</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Traduction</th>
              {isKeyword && <th scope="col" className="px-3 py-2.5 font-semibold">Texte de rappel</th>}
              <th scope="col" className="px-5 py-2.5 text-right font-semibold">Cartes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.en} className="border-t border-border align-top">
                <td className="px-5 py-3 font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {row.en}
                    {row.origin === "rules" && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                        Règles
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={row.value}
                    onChange={(event) => update(row.en, { value: event.target.value })}
                    aria-label={`Traduction de ${row.en}`}
                    placeholder={isKeyword ? "À traduire" : row.en}
                  />
                </td>
                {isKeyword && (
                  <td className="px-3 py-2">
                    <Input
                      value={row.reminder}
                      onChange={(event) => update(row.en, { reminder: event.target.value })}
                      aria-label={`Rappel de ${row.en}`}
                      placeholder="Facultatif"
                    />
                  </td>
                )}
                <td className="px-5 py-3 text-right font-mono text-muted-foreground">{row.count}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={isKeyword ? 4 : 3} className="px-5 py-6 text-muted-foreground">
                  {rows.length === 0 ? "Aucun terme relevé sur les cartes de ce jeu." : "Aucun terme ne correspond."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground">
        <span>Un changement vaut aussitôt pour toutes les cartes qui portent le terme.</span>
        <Button type="button" onClick={save} disabled={pending || (!dirty && suggested === 0)}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </section>
  );
}
