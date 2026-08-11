"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Minus, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { GameProductSummary } from "@/lib/db/products";
import type { BattleReportArmy, BattleReportArmyUnit } from "@/lib/types/Match";
import {
  MAX_ARMY_NAME_LENGTH,
  MAX_ARMY_UNITS,
  MAX_UNIT_NAME_LENGTH,
  MAX_UNIT_QUANTITY,
  countArmyUnits,
} from "@/lib/battle-reports/army";
import { searchBattleReportUnitsAction } from "@/app/game-matches/actions";

/**
 * Saisie d'une liste d'armée.
 *
 * L'autocomplétion propose les figurines du catalogue du jeu, mais **ne s'y
 * substitue pas** : le bouton « ajouter tel quel » accepte n'importe quel nom.
 * Un catalogue est toujours en retard sur la dernière sortie, et une figurine
 * convertie n'y entrera jamais ; refuser la saisie libre reviendrait à refuser
 * le rapport.
 *
 * Composant contrôlé : il ne sait pas enregistrer. C'est l'appelant qui décide
 * si la liste part avec le formulaire de création ou par une action dédiée.
 */
export default function ArmyListEditor({
  gameId,
  army,
  onChange,
  disabled = false,
  idPrefix,
}: {
  gameId: string;
  army: BattleReportArmy;
  onChange: (army: BattleReportArmy) => void;
  disabled?: boolean;
  /** Préfixe des `id` : plusieurs listes cohabitent sur la page d'une partie. */
  idPrefix: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameProductSummary[]>([]);
  const [searching, setSearching] = useState(false);

  // Les réponses reviennent dans le désordre : seule la dernière recherche
  // lancée a le droit d'écrire dans les résultats.
  const sequence = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !gameId) {
      setResults([]);
      return;
    }

    const current = ++sequence.current;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const found = await searchBattleReportUnitsAction(gameId, trimmed);
        if (current === sequence.current) {
          setResults(found);
        }
      } finally {
        if (current === sequence.current) {
          setSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [gameId, query]);

  const units = army.units;
  const atMax = units.length >= MAX_ARMY_UNITS;
  const trimmedQuery = query.trim();

  const setUnits = (next: BattleReportArmyUnit[]) => onChange({ ...army, units: next });

  /**
   * Ajouter deux fois la même figurine en augmente la quantité : c'est ce que
   * veut dire un second clic, et c'est aussi ce que fait la normalisation à
   * l'enregistrement — autant le montrer tout de suite.
   */
  const addUnit = (unit: BattleReportArmyUnit) => {
    const sameUnit = (line: BattleReportArmyUnit) =>
      unit.productId
        ? line.productId === unit.productId
        : !line.productId && line.name.toLocaleLowerCase() === unit.name.toLocaleLowerCase();

    const existing = units.find(sameUnit);

    if (existing) {
      setUnits(
        units.map((line) =>
          sameUnit(line)
            ? { ...line, quantity: Math.min(MAX_UNIT_QUANTITY, line.quantity + 1) }
            : line
        )
      );
    } else {
      if (atMax) return;
      setUnits([...units, unit]);
    }

    setQuery("");
    setResults([]);
  };

  const setQuantity = (index: number, quantity: number) => {
    setUnits(
      units.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, quantity: Math.min(MAX_UNIT_QUANTITY, Math.max(1, quantity)) }
          : line
      )
    );
  };

  const removeUnit = (index: number) => {
    setUnits(units.filter((_, lineIndex) => lineIndex !== index));
  };

  const total = countArmyUnits(army);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-army-name`} className="text-xs text-muted-foreground">
          Nom de la liste <span className="text-muted-foreground">(optionnel)</span>
        </label>
        <Input
          id={`${idPrefix}-army-name`}
          type="text"
          value={army.name ?? ""}
          maxLength={MAX_ARMY_NAME_LENGTH}
          disabled={disabled}
          placeholder="Ex. : Vador et ses chasseurs"
          onChange={(event) => onChange({ ...army, name: event.target.value })}
        />
      </div>

      {units.length > 0 && (
        <ul className="space-y-2">
          {units.map((unit, index) => (
            <li
              key={`${unit.productId ?? "libre"}-${unit.name}-${index}`}
              className="flex items-center gap-2 rounded-lg border p-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{unit.name}</span>
                {!unit.productId && (
                  <span className="block text-xs text-muted-foreground">Saisie libre</span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQuantity(index, unit.quantity - 1)}
                  disabled={disabled || unit.quantity <= 1}
                  aria-label={`Retirer une figurine de ${unit.name}`}
                  className="flex size-7 items-center justify-center rounded border border-input disabled:opacity-40"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-8 text-center text-sm tabular-nums">{unit.quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(index, unit.quantity + 1)}
                  disabled={disabled || unit.quantity >= MAX_UNIT_QUANTITY}
                  aria-label={`Ajouter une figurine de ${unit.name}`}
                  className="flex size-7 items-center justify-center rounded border border-input disabled:opacity-40"
                >
                  <Plus className="size-3.5" />
                </button>
              </span>
              <button
                type="button"
                onClick={() => removeUnit(index)}
                disabled={disabled}
                aria-label={`Retirer ${unit.name} de la liste`}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-40"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {units.length > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {units.length} référence{units.length === 1 ? "" : "s"} · {total} figurine
          {total === 1 ? "" : "s"}
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          disabled={disabled || atMax}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={MAX_UNIT_NAME_LENGTH}
          placeholder="Rechercher une figurine…"
          className="pl-9"
          aria-label="Rechercher une figurine à ajouter à la liste"
        />
      </div>

      {atMax && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Une liste d&apos;armée ne peut pas compter plus de {MAX_ARMY_UNITS} références.
        </p>
      )}

      {searching && <p className="text-xs text-muted-foreground">Recherche…</p>}

      {results.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  addUnit({
                    productId: product.id,
                    name: product.name,
                    // Recopiée comme le nom : c'est elle qui illustrera le
                    // jeton de l'unité sur la table.
                    ...(product.image ? { image: product.image } : {}),
                    quantity: 1,
                  })
                }
                className="flex w-full items-center gap-2 rounded-lg border p-2 text-left hover:border-primary"
              >
                {product.image ? (
                  <Image
                    src={product.image}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                    className="size-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="size-8 shrink-0 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{product.name}</span>
                  {product.setCode && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {product.setCode}
                    </span>
                  )}
                </span>
                <Plus className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* La saisie libre reste ouverte même quand le catalogue répond : le
          produit trouvé n'est pas toujours celui qu'on a joué. */}
      {trimmedQuery.length > 0 && !atMax && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => addUnit({ name: trimmedQuery, quantity: 1 })}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed p-2 text-left text-sm hover:border-primary disabled:opacity-40"
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            Ajouter «&nbsp;{trimmedQuery}&nbsp;» tel quel
          </span>
        </button>
      )}

      {!searching && trimmedQuery.length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Aucune figurine du catalogue ne correspond. Vous pouvez l&apos;ajouter telle quelle.
        </p>
      )}
    </div>
  );
}
