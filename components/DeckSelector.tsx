"use client";

import { useState, useEffect } from "react";
import { Deck } from "@/lib/types/Deck";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createDeckAction } from "@/app/decks/actions";
import { toast } from "sonner";

type DeckSelectorProps = {
  playerId: string;
  gameId: string;
  value?: string; // deckId sélectionné
  onChange: (deckId: string | undefined) => void;
  disabled?: boolean;
  playerName?: string; // Pour l'affichage
};

export default function DeckSelector({
  playerId,
  gameId,
  value,
  onChange,
  disabled,
  playerName,
}: DeckSelectorProps) {
  const [open, setOpen] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Charger les decks du joueur pour ce jeu
  useEffect(() => {
    const loadDecks = async () => {
      if (!playerId || !gameId) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/decks?playerId=${playerId}&gameId=${gameId}&limit=50`
        );
        if (response.ok) {
          const data = await response.json();
          setDecks(data.decks || []);
        }
      } catch (error) {
        console.error("Error loading decks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecks();
  }, [playerId, gameId]);

  const selectedDeck = decks.find((deck) => deck.id === value);

  // Filtrer les decks en fonction de la recherche
  const filteredDecks = decks.filter((deck) =>
    deck.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Vérifier si le nom de recherche correspond exactement à un deck existant
  const exactMatch = decks.find(
    (deck) => deck.name.toLowerCase() === searchQuery.toLowerCase()
  );

  const handleCreateDeck = async () => {
    if (!searchQuery.trim()) {
      toast.error("Erreur", {
        description: "Veuillez entrer un nom pour le nouveau deck.",
      });
      return;
    }

    setIsCreating(true);
    try {
      const result = await createDeckAction({
        name: searchQuery.trim(),
        gameId,
        visibility: "private",
      });

      if (result.success && result.deck) {
        toast.success("Deck créé", {
          description: `Le deck "${result.deck.name}" a été créé.`,
        });
        // Ajouter le nouveau deck à la liste
        setDecks([...decks, result.deck]);
        // Sélectionner le nouveau deck
        onChange(result.deck.id);
        setOpen(false);
        setSearchQuery("");
      } else {
        toast.error("Erreur", {
          description: result.error || "Impossible de créer le deck.",
        });
      }
    } catch (error) {
      console.error("Error creating deck:", error);
      toast.error("Erreur", {
        description: "Une erreur est survenue lors de la création du deck.",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedDeck ? (
            <span className="truncate">{selectedDeck.name}</span>
          ) : (
            <span className="text-muted-foreground">
              {playerName ? `Deck de ${playerName}` : "Sélectionner un deck"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher un deck..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Chargement..." : "Aucun deck trouvé."}
            </CommandEmpty>

            {/* Option pour effacer la sélection */}
            {value && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Aucun deck
                </CommandItem>
              </CommandGroup>
            )}

            {/* Decks existants */}
            {filteredDecks.length > 0 && (
              <CommandGroup heading="Decks existants">
                {filteredDecks.map((deck) => (
                  <CommandItem
                    key={deck.id}
                    value={deck.id}
                    onSelect={() => {
                      onChange(deck.id);
                      setOpen(false);
                      setSearchQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === deck.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {deck.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Option de création de deck si aucun match exact */}
            {searchQuery.trim() && !exactMatch && !isLoading && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleCreateDeck}
                  disabled={isCreating}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isCreating
                    ? "Création en cours..."
                    : `Créer le deck "${searchQuery.trim()}"`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
