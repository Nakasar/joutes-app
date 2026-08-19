"use client";

import { useState, useTransition } from "react";
import type { ProductEditionCensus } from "@/lib/db/products.ts";
import { saveCurrentProductEdition } from "./actions.ts";

/**
 * Édition en cours d'un jeu.
 *
 * Le réglage vit ici, au-dessus du catalogue qu'il gouverne, et non dans la
 * fiche du jeu : choisir une édition en cours, c'est décider de ce que les
 * joueurs **ne** verront **pas** par défaut, et cette décision ne se prend bien
 * qu'en voyant combien de produits portent quelle édition — et combien n'en
 * portent aucune.
 */
export default function EditionSettings({
  gameId,
  gameName,
  currentEdition,
  census,
}: {
  gameId: string;
  gameName: string;
  currentEdition?: string;
  census: ProductEditionCensus;
}) {
  const [edition, setEdition] = useState(currentEdition ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const saved = currentEdition ?? "";
  const dirty = edition.trim() !== saved;

  // Ce que le joueur verra par défaut une fois enregistré. Les produits sans
  // édition n'appartiennent à aucune : ils sortent des écrans avec les autres.
  const visible = edition.trim()
    ? census.editions.find((row) => row.edition === edition.trim())?.count ?? 0
    : census.editions.reduce((sum, row) => sum + row.count, 0) + census.untagged;

  const save = () => {
    startTransition(async () => {
      const result = await saveCurrentProductEdition(gameId, edition.trim());
      setMessage(
        result.success
          ? { ok: true, text: "Édition en cours enregistrée." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" }
      );
    });
  };

  return (
    <div className="bg-card rounded-lg shadow-md p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Édition en cours</h2>
        <p className="text-sm text-muted-foreground">
          Pour les gammes qui traversent plusieurs éditions, pas toujours compatibles entre elles. Les catalogues
          de {gameName} ne montrent que celle-ci par défaut ; les joueurs peuvent demander les autres, ou toutes.
          Laissez vide si ce jeu n&apos;a qu&apos;une édition.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <label htmlFor="current-edition" className="block text-sm font-medium text-foreground">
            Édition
          </label>
          <input
            id="current-edition"
            list="known-editions"
            value={edition}
            onChange={(event) => {
              setEdition(event.target.value);
              setMessage(null);
            }}
            placeholder="Aucune édition"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          {/* Les éditions déjà présentes au catalogue sont proposées, sans être
              imposées : on peut désigner l'édition à venir avant d'avoir
              étiqueté le moindre produit. */}
          <datalist id="known-editions">
            {census.editions.map((row) => (
              <option key={row.edition} value={row.edition} />
            ))}
          </datalist>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      <div className="space-y-1 border-t pt-3 text-sm">
        {census.editions.length === 0 && census.untagged === 0 ? (
          <p className="text-muted-foreground">Aucun produit au catalogue.</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Au catalogue :{" "}
              {census.editions.length > 0
                ? census.editions.map((row) => `${row.count} en « ${row.edition} »`).join(", ")
                : "aucune édition renseignée"}
              {census.untagged > 0 ? `, ${census.untagged} sans édition` : ""}.
            </p>
            {/* L'avertissement qui compte : un étiquetage incomplet vide les
                écrans sans rien dire, et passerait pour une panne. */}
            {edition.trim() && census.untagged > 0 && (
              <p className="text-amber-700 dark:text-amber-300">
                {census.untagged} produit{census.untagged === 1 ? "" : "s"} sans édition{" "}
                {census.untagged === 1 ? "sera masqué" : "seront masqués"} par défaut : un produit sans édition
                n&apos;appartient à aucune. Renseignez leur attribut{" "}
                <span className="font-mono">edition</span> pour les faire réapparaître.
              </p>
            )}
            <p className="text-muted-foreground">
              {dirty ? "Après enregistrement, " : "Par défaut, "}
              {visible} produit{visible === 1 ? "" : "s"} sur{" "}
              {census.editions.reduce((sum, row) => sum + row.count, 0) + census.untagged} seront visibles.
            </p>
          </>
        )}
      </div>

      {message && (
        <p className={message.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>{message.text}</p>
      )}
    </div>
  );
}
