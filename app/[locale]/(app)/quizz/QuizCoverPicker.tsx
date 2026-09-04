"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import CardImage from "@/components/cards/CardImage.tsx";
import { QuizCoverImage } from "@/components/quizzes/QuizCoverImage.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { resolveQuizCover } from "@/lib/quizzes/cover.ts";
import type { BoosterCard } from "@/lib/types/booster.ts";

/** Ce que le choix d'une couverture écrit sur le quizz. */
export type QuizCoverChoice = {
  /** Carte du jeu retenue ; `""` retire le choix. */
  coverCardId: string;
  /** Image déposée ; `""` la retire. */
  coverImageUrl: string;
};

/**
 * Le choix de l'illustration d'un quizz : une carte du jeu, ou une image à soi.
 *
 * Les deux moyens dans le même champ parce qu'ils répondent à la même question,
 * et qu'ils s'excluent — choisir l'un efface l'autre, sans quoi l'aperçu
 * montrerait une image que l'enregistrement ne garderait pas.
 *
 * La carte se cherche **par son nom** plutôt que de se choisir dans une liste :
 * un quizz n'a pas de contenu de deck où puiser, c'est tout le catalogue du jeu
 * qui est candidat. Sans jeu rattaché, il n'y a pas de catalogue où chercher :
 * seul le dépôt reste alors ouvert.
 *
 * Le fichier part dès qu'il est choisi — il faut bien qu'il soit déposé pour
 * qu'on puisse le regarder —, mais rien ne l'inscrit sur le quizz avant
 * l'enregistrement du formulaire.
 */
export default function QuizCoverPicker({
  gameSlug,
  coverCardId,
  coverImageUrl,
  initialCardImage,
  onChange,
}: {
  /** Le jeu rattaché, dont on cherche les cartes. Absent : pas de catalogue. */
  gameSlug?: string;
  coverCardId: string;
  coverImageUrl: string;
  /** Illustration déjà connue de la carte désignée, à la réouverture du quizz. */
  initialCardImage?: string;
  onChange: (choice: QuizCoverChoice) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoosterCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // L'illustration de la carte désignée : celle d'un résultat qu'on vient de
  // choisir, ou celle que le quizz portait déjà. Elle ne s'enregistre pas — le
  // serveur la redérive du catalogue — mais sans elle l'aperçu resterait vide.
  const [cardImage, setCardImage] = useState(initialCardImage);

  const cover = resolveQuizCover({
    coverImageUrl: coverImageUrl || undefined,
    coverCardId: coverCardId || undefined,
    coverImage: cardImage,
  });

  useEffect(() => {
    if (!gameSlug || query.trim().length <= 2) {
      setResults([]);
      // Une recherche en vol vient d'être abandonnée par le nettoyage de
      // l'effet précédent : sans cette remise à zéro, « Recherche… » resterait
      // affiché pour toujours sous un champ qu'on vient de vider.
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/games/${gameSlug}/cards?searchQuery=${encodeURIComponent(query)}&setCode=*&lang=all`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Recherche impossible");
        const cards: BoosterCard[] = await response.json();
        setResults(cards.filter((card) => card.image).slice(0, 8));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Erreur lors de la recherche de cartes:", error);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, gameSlug]);

  const upload = async (file: File) => {
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/quizzes/cover", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.error ?? "Téléversement impossible");
        return;
      }

      // Déposer une image est le geste le plus explicite : il remplace la carte
      // désignée plutôt que de se superposer à elle.
      setCardImage(undefined);
      onChange({ coverCardId: "", coverImageUrl: payload.url });
    } catch {
      toast.error("Téléversement impossible");
    } finally {
      setIsUploading(false);
    }
  };

  const pickCard = (card: BoosterCard) => {
    setCardImage(card.image);
    onChange({ coverCardId: card.id, coverImageUrl: "" });
    setQuery("");
    setResults([]);
  };

  const clear = () => {
    setCardImage(undefined);
    onChange({ coverCardId: "", coverImageUrl: "" });
  };

  return (
    <div className="space-y-3">
      {cover.image ? (
        <div className="space-y-1">
          <QuizCoverImage
            cover={cover}
            className="aspect-[16/7] w-full max-w-xl rounded-lg border"
          />
          <p className="text-xs text-muted-foreground">
            {cover.source === "upload" ? "Votre image." : "Une carte du jeu."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune couverture : le quizz s&apos;affichera sans bandeau.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {coverImageUrl ? "Remplacer l'image" : "Téléverser une image"}
        </Button>
        {(coverImageUrl || coverCardId) && (
          <Button type="button" variant="ghost" size="sm" disabled={isUploading} onClick={clear}>
            <Trash2 className="h-4 w-4" />
            Retirer
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
          // Le même fichier rechoisi doit relancer un dépôt : sans cette remise
          // à zéro, `change` ne se déclenche pas deux fois de suite.
          event.target.value = "";
        }}
      />

      {gameSlug ? (
        <div className="space-y-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="… ou chercher une carte par son nom"
            className="sm:max-w-md"
          />

          {isSearching && <p className="text-sm text-muted-foreground">Recherche…</p>}

          {!isSearching && query.trim().length > 2 && results.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune carte trouvée.</p>
          )}

          {results.length > 0 && (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border sm:max-w-md">
              {results.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => pickCard(card)}
                    className="flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-muted"
                  >
                    <CardImage
                      src={card.image}
                      alt={card.name}
                      orientation={card.orientation}
                      className="h-12 w-auto rounded"
                    />
                    <span>
                      <span className="block font-medium">{card.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {card.setCode} #{card.collectorNumber}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Rattachez le quizz à un jeu au catalogue de cartes pour l&apos;illustrer de l&apos;une
          d&apos;elles.
        </p>
      )}
    </div>
  );
}
