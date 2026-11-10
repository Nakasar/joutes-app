"use client";

import { useTranslations } from "next-intl";

import type { LobbyDeck } from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TableCards } from "@/lib/engine/cards";
import type { DeckChoice } from "@/lib/engine/tables";

export function choiceKey(choice: DeckChoice | null): string {
  if (!choice) return "";
  return choice.kind === "deck" ? `deck:${choice.deckId}` : `auto:${choice.legend}`;
}

function parseKey(key: string): DeckChoice | null {
  if (key.startsWith("deck:")) return { kind: "deck", deckId: key.slice(5) };
  if (key.startsWith("auto:")) return { kind: "auto", legend: key.slice(5) };
  return null;
}

type DeckPickerProps = {
  id: string;
  decks: LobbyDeck[];
  legends: string[];
  cards: TableCards;
  value: DeckChoice | null;
  onChange: (choice: DeckChoice | null) => void;
};

/**
 * Le deck avec lequel on s'assoit : l'un des siens, s'il est jouable par le
 * moteur, ou un deck construit automatiquement autour d'une légende.
 */
export function DeckPicker({ id, decks, legends, cards, value, onChange }: DeckPickerProps) {
  const t = useTranslations("Games.Play");
  const playable = decks.filter((deck) => deck.list !== null);
  const refused = decks.filter((deck) => deck.list === null);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("deck.label")}</Label>
      <Select value={choiceKey(value)} onValueChange={(key) => onChange(parseKey(key))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t("deck.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          {playable.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t("deck.mine")}</SelectLabel>
              {playable.map((deck) => (
                <SelectItem key={deck.id} value={`deck:${deck.id}`}>
                  {deck.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>{t("deck.auto")}</SelectLabel>
            {legends.map((code) => (
              <SelectItem key={code} value={`auto:${code}`}>
                {cards[code]?.name ?? code}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {refused.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">{t("deck.refused", { count: refused.length })}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {refused.map((deck) => (
              <li key={deck.id}>
                <span className="font-medium text-foreground">{deck.name}</span>
                <ul className="list-disc pl-5">
                  {deck.problems.slice(0, 4).map((problem, index) => (
                    <li key={index}>
                      {problem === "noLegend" || problem === "noChampion" || problem === "unknownCard"
                        ? t(`deck.problem.${problem}`)
                        : problem}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
