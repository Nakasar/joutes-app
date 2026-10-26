"use client";

import { useEffect, useMemo, useState } from "react";
import { Game } from "@/lib/types/Game.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toDeckCardInfo, type RawCard } from "@/lib/decks/card-info.ts";
import { deckLegality, deckSize, type DeckCardInfo, type DeckCards } from "@/lib/decks/contents.ts";
import { routeCardToZone } from "@/lib/decks/routing.ts";
import { applyDeckText, normalizeCardName, parseDeckText } from "@/lib/decks/text.ts";
import { defaultDeckZone, getDeckZones, zoneCounterLabel } from "@/lib/decks/zones.ts";
import { DECK_VISIBILITIES, DECK_VISIBILITY_LABELS, type Deck, type DeckVisibility } from "@/lib/types/Deck.ts";
import { toast } from "sonner";

type CreateDeckDialogProps = {
  games: Game[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le deck créé est passé à l'appelant : c'est ce qui permet d'ouvrir son éditeur. */
  onSuccess: (deck?: Deck) => void;
  /**
   * Jeu imposé, quand la fenêtre s'ouvre depuis la page d'un jeu : le champ
   * disparaît plutôt que de proposer un choix déjà fait. La liste `games` n'a
   * alors qu'à contenir ce jeu.
   */
  lockedGameId?: string;
};

/** Le temps de finir de coller ou de taper avant d'interroger le catalogue. */
const IMPORT_DEBOUNCE_MS = 500;
/** Au-delà, les suggestions de remplacement coûtent plus qu'elles n'aident. */
const MAX_SUGGESTIONS = 10;

type ImportPreview = {
  cards: DeckCards;
  unmatched: string[];
  /** Nom du catalogue proposé pour une ligne non reconnue. */
  suggestions: Record<string, string>;
};

/**
 * Lecture de la liste collée, au fil de la saisie : la même que celle de
 * l'onglet « Texte » de l'éditeur — mêmes en-têtes, même appariement par nom,
 * même rangement par type pour les lignes sans section.
 */
async function previewDeckText(gameSlug: string, text: string, zones: ReturnType<typeof getDeckZones>, signal: AbortSignal): Promise<ImportPreview | null> {
  const parsed = parseDeckText(text, zones);
  if (parsed.lines.length === 0) return null;

  const names = [...new Set(parsed.lines.map((line) => line.name))];
  const response = await fetch(`/api/games/${gameSlug}/deck-cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
    signal,
  });
  if (!response.ok) return null;

  const data: { matches?: Record<string, RawCard> } = await response.json();
  const byName = new Map<string, DeckCardInfo>();
  for (const [name, raw] of Object.entries(data.matches ?? {})) {
    byName.set(normalizeCardName(name), toDeckCardInfo(raw));
  }
  const byId = new Map([...byName.values()].map((card) => [card.id, card]));

  const applied = applyDeckText(
    parsed,
    (name) => byName.get(normalizeCardName(name))?.id,
    (cardId, cards) => {
      const card = byId.get(cardId);
      return card ? routeCardToZone(card, zones, cards) : defaultDeckZone(zones);
    }
  );

  // Une faute de frappe ne doit pas coûter la ligne : la recherche, tolérante
  // aux fautes, propose le nom le plus proche.
  const suggestions: Record<string, string> = {};
  await Promise.all(
    applied.unmatched.slice(0, MAX_SUGGESTIONS).map(async (name) => {
      const params = new URLSearchParams({ searchQuery: name, limit: "1" });
      const found = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`, { signal })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      const suggestion = found?.cards?.[0]?.name;
      if (typeof suggestion === "string" && normalizeCardName(suggestion) !== normalizeCardName(name)) {
        suggestions[name] = suggestion;
      }
    })
  );

  return { cards: applied.cards, unmatched: applied.unmatched, suggestions };
}

/** Remplace un nom de carte dans la liste collée, sur les lignes qui le portent. */
function replaceCardName(text: string, from: string, to: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trimEnd();
      return trimmed.endsWith(from) ? trimmed.slice(0, trimmed.length - from.length) + to : line;
    })
    .join("\n");
}

export default function CreateDeckDialog({
  games,
  open,
  onOpenChange,
  onSuccess,
  lockedGameId,
}: CreateDeckDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const emptyForm = {
    name: "",
    gameId: lockedGameId ?? "",
    url: "",
    description: "",
    decklist: "",
    visibility: "private" as DeckVisibility,
  };
  const [formData, setFormData] = useState(emptyForm);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);

  const game = games.find((entry) => entry.id === formData.gameId);
  const gameSlug = game?.slug ?? game?.id;
  const zones = useMemo(() => getDeckZones(game), [game]);

  useEffect(() => {
    if (!gameSlug || !formData.decklist.trim()) {
      setPreview(null);
      setReading(false);
      return;
    }

    const controller = new AbortController();
    setReading(true);
    const timer = window.setTimeout(() => {
      previewDeckText(gameSlug, formData.decklist, zones, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setPreview(result);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPreview(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setReading(false);
        });
    }, IMPORT_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [formData.decklist, gameSlug, zones]);

  const importedCount = preview ? deckSize(preview.cards, zones) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La liste appariée part avec le deck : il s'ouvre déjà rempli dans
        // l'éditeur. Le texte brut suit aussi, pour les lignes non reconnues.
        body: JSON.stringify({ ...formData, ...(preview && importedCount > 0 ? { cards: preview.cards } : {}) }),
      });

      if (response.ok) {
        const deck: Deck = await response.json();
        toast.success("Deck créé", {
          description: "Votre deck a été créé avec succès.",
        });
        setFormData(emptyForm);
        setPreview(null);
        onSuccess(deck);
      } else {
        const data = await response.json();
        toast.error("Erreur", {
          description: data.error || "Impossible de créer le deck.",
        });
      }
    } catch (error) {
      console.error("Error creating deck:", error);
      toast.error("Erreur", {
        description: "Une erreur est survenue lors de la création du deck.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bornée à la hauteur de l'écran, corps défilant : la liste de cartes
          collée peut faire plusieurs centaines de lignes, et une fenêtre en
          position fixe qui déborde emporte ses boutons hors d'atteinte. */}
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-[600px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Créer un nouveau deck</DialogTitle>
            <DialogDescription>
              Partez de zéro, ou collez une liste : elle remplit le deck dès sa création.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Azir Tokens"
                required
                disabled={isLoading}
              />
            </div>

            {/* Game */}
            {/* Le champ n'est pas seulement masqué quand le jeu est imposé : un
                champ requis rendu invisible fait échouer la validation native
                du navigateur sur un contrôle qu'il ne peut pas mettre au
                point. */}
            {!lockedGameId && (
              <div className="space-y-2">
                <Label htmlFor="gameId">
                  Jeu <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.gameId}
                  onValueChange={(value) => setFormData({ ...formData, gameId: value })}
                  required
                  disabled={isLoading}
                >
                  <SelectTrigger id="gameId">
                    <SelectValue placeholder="Sélectionnez un jeu" />
                  </SelectTrigger>
                  <SelectContent>
                    {games.map((game) => (
                      <SelectItem key={game.id} value={game.id}>
                        {game.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="url">URL (optionnel)</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/mon-deck"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Lien vers un site extérieur présentant le deck
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optionnel)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrivez votre deck, sa stratégie..."
                rows={4}
                disabled={isLoading}
                className="max-h-[30dvh]"
              />
            </div>

            {/* Decklist */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Label htmlFor="decklist">
                  Importer une liste <span className="font-normal text-muted-foreground">(optionnel)</span>
                </Label>
                <span className="text-xs text-muted-foreground">texte ou export Piltover / TCG Arena</span>
              </div>
              <Textarea
                id="decklist"
                value={formData.decklist}
                onChange={(e) => setFormData({ ...formData, decklist: e.target.value })}
                placeholder={"Legend:\n1 Loose Cannon\nMainDeck:\n3 Get Excited!\n…"}
                rows={8}
                disabled={isLoading}
                className="field-sizing-fixed font-mono text-sm"
              />
              {formData.decklist.trim() && (
                <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3" aria-live="polite">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">Lecture de la liste</span>
                    {reading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lecture en cours" />}
                  </div>
                  {!formData.gameId ? (
                    <p className="text-xs text-muted-foreground">Choisissez le jeu pour lire la liste.</p>
                  ) : preview ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {deckLegality(preview.cards, zones)
                          .filter((row) => row.count > 0 || row.zone.min !== undefined)
                          .map((row) => (
                            <span
                              key={row.zone.key}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                                row.compliant
                                  ? "bg-muted text-foreground"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              )}
                            >
                              {row.zone.short}
                              <strong className="font-mono">{zoneCounterLabel(row.zone, row.count, row.contributed)}</strong>
                            </span>
                          ))}
                      </div>
                      {preview.unmatched.length > 0 && (
                        <div className="space-y-1.5 border-t pt-2">
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {preview.unmatched.length} ligne{preview.unmatched.length > 1 ? "s" : ""} non reconnue
                            {preview.unmatched.length > 1 ? "s" : ""}, elle{preview.unmatched.length > 1 ? "s" : ""} ne
                            {preview.unmatched.length > 1 ? " seront" : " sera"} pas ajoutée{preview.unmatched.length > 1 ? "s" : ""}
                          </p>
                          {preview.unmatched.map((name) => (
                            <div key={name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-mono text-xs">{name}</span>
                              {preview.suggestions[name] && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setFormData({
                                      ...formData,
                                      decklist: replaceCardName(formData.decklist, name, preview.suggestions[name]),
                                    })
                                  }
                                >
                                  Remplacer par « {preview.suggestions[name]} »
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    !reading && <p className="text-xs text-muted-foreground">Aucune carte reconnue pour l&apos;instant.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Sans en-têtes de section, chaque carte est rangée selon son type, comme dans l&apos;éditeur.
                  </p>
                </div>
              )}
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibilité</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value: DeckVisibility) =>
                  setFormData({ ...formData, visibility: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECK_VISIBILITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DECK_VISIBILITY_LABELS[option].label} ({DECK_VISIBILITY_LABELS[option].hint.toLowerCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            {importedCount > 0 && (
              <span className="mr-auto self-center text-sm text-muted-foreground">
                {importedCount} carte{importedCount > 1 ? "s" : ""} seront ajoutée{importedCount > 1 ? "s" : ""}
              </span>
            )}
            <Button type="submit" disabled={isLoading || reading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer et ouvrir l&apos;éditeur
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
