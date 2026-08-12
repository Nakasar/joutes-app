"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  applyTokenSuggestion,
  parseSearchSyntax,
  suggestTokens,
  type SearchField,
  type SuggestionHint,
} from "@/lib/cards/search-syntax";

/**
 * Barre de recherche de cartes : le texte libre et les tokens du jeu
 * (`domain:fury energy<=3`) dans le même champ, avec les suggestions qui vont
 * avec. Le vocabulaire vient des facettes, pas du code.
 *
 * Partagée par la galerie et par les éditeurs de booster et de paquet de cube,
 * pour que la même saisie donne le même résultat partout. La lecture des tokens
 * se refait de toute façon côté serveur : ce composant ne fait que la montrer.
 */
export function CardSearchInput({
  value,
  onChange,
  fields,
  placeholder,
  inputRef,
  className,
  openOnFocus = true,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  fields: SearchField[];
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
  /**
   * Ouvrir les suggestions dès la prise de focus. Vrai sur une page de
   * recherche, où elles font découvrir ce que le jeu sait filtrer ; faux dans
   * un éditeur, où le champ garde ses raccourcis clavier vers les résultats.
   */
  openOnFocus?: boolean;
  /** Touches que les suggestions ne prennent pas : à l'appelant de trancher. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations("Games");
  const listId = useId();
  // Suggestions : ouvertes à la frappe, parcourues au clavier. `-1` = aucune
  // sélectionnée, la touche Entrée revient alors à l'appelant.
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const suggestions = open ? suggestTokens(value, fields) : [];
  const parsed = parseSearchSyntax(value, fields);

  // Le module de syntaxe tourne aussi côté serveur : il décrit ce que fait une
  // suggestion, c'est ici que ça devient une phrase, dans la langue de l'écran.
  const hintLabel = (hint: SuggestionHint) =>
    t(`cards.search.syntax.hints.${hint.kind}`, { field: hint.field, value: hint.value });

  const pick = (token: string) => {
    onChange(applyTokenSuggestion(value, token));
    setActive(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
        return;
      }
      // Entrée complète la suggestion en cours ; sans sélection, elle repart à
      // l'appelant — compléter puis chercher restent deux gestes.
      if (event.key === "Enter" && suggestions[active]) {
        event.preventDefault();
        pick(suggestions[active].token);
        return;
      }
    }
    if (event.key === "Enter") setOpen(false);
    onKeyDown?.(event);
  };

  return (
    <div className="relative flex flex-1 items-center">
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder ?? t("cards.search.placeholder")}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => openOnFocus && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-autocomplete="list"
        // Ces deux attributs ne désignent quelque chose que lorsque la liste est
        // rendue : les poser à vide pointerait vers un id inexistant, que les
        // validateurs ARIA signalent.
        aria-controls={suggestions.length > 0 ? listId : undefined}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={className ?? "h-10 w-full pl-9 font-mono text-sm"}
      />

      {suggestions.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-11 z-20 rounded-lg border bg-popover p-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.token}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              // `onMouseDown` plutôt que `onClick` : le clic doit agir avant que
              // la perte de focus ne referme la liste.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(suggestion.token);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${
                index === active ? "bg-muted" : ""
              }`}
            >
              <span className="font-mono text-xs text-primary">{suggestion.token}</span>
              {/* Poussé à droite plutôt qu'aligné sur une colonne fixe : un token
                  long — `type:"Battlefield Rune"` — décalerait toute la colonne
                  des explications. */}
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {hintLabel(suggestion.hint)}
              </span>
            </button>
          ))}
          <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
            {parsed.tokens.length > 0
              ? t("cards.search.syntax.tokens", { count: parsed.tokens.length })
              : t("cards.search.syntax.invite")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
