"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  currentWord,
  parseSearchSyntax,
  removeSearchWord,
  type SearchField,
} from "@/lib/cards/search-syntax";

/**
 * Les filtres lus dans la saisie, en pastilles retirables d'un clic, et les
 * tokens dont la valeur n'a pas été comprise. C'est ce que montre la galerie
 * sous sa barre : les écrans qui reprennent la syntaxe le montrent de la même
 * façon.
 */
export function SearchTokenChips({
  value,
  onChange,
  fields,
  trailing,
}: {
  value: string;
  onChange: (next: string) => void;
  fields: SearchField[];
  /** Ce qui se pose au bout de la ligne : un nombre de résultats, un bouton. */
  trailing?: React.ReactNode;
}) {
  const t = useTranslations("Games");
  const parsed = parseSearchSyntax(value, fields);
  // Le mot en cours de frappe est forcément incomplet : l'annoncer comme
  // invalide reviendrait à signaler une faute à chaque lettre tapée.
  const typing = currentWord(value);
  const rejected = parsed.rejected.filter((token) => token.raw !== typing);

  if (parsed.tokens.length === 0 && rejected.length === 0 && !trailing) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {parsed.tokens.length > 0 || trailing ? (
        <div className="flex flex-wrap items-center gap-2">
          {parsed.tokens.map((token, index) => (
            <button
              // Rien n'empêche de taper deux fois le même token : chaque
              // pastille en retire une occurrence.
              key={`${index}-${token.raw}`}
              type="button"
              onClick={() => onChange(removeSearchWord(value, token.raw))}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs hover:bg-muted/70"
            >
              {token.label}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
          {trailing ? <div className="ml-auto">{trailing}</div> : null}
        </div>
      ) : null}
      {rejected.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">
          {rejected.map((token, index) => (
            <li key={`${index}-${token.raw}`}>
              {t(`cards.search.syntax.rejected.${token.reason}`, { token: token.raw, field: token.field })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
