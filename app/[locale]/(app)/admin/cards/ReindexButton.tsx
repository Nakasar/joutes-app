"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button.tsx";
import { reindexGameCards } from "./actions.ts";

type Props = {
  gameId: string;
  gameName: string;
  /** Faux quand le jeu n'a pas d'index de recherche : il n'y a rien à mettre à jour. */
  hasSearchIndex: boolean;
};

/**
 * Repousse tout le catalogue du jeu dans l'index de recherche. À utiliser après
 * une modification en masse en base, ou quand la recherche a divergé des
 * cartes réellement enregistrées.
 */
export default function ReindexButton({ gameId, gameName, hasSearchIndex }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!hasSearchIndex) {
    return (
      <p className="text-xs text-muted-foreground">
        {gameName} n&apos;a pas d&apos;index de recherche : ses cartes ne sont pas indexées.
      </p>
    );
  }

  const handleClick = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await reindexGameCards(gameId);
      if (!result.success) {
        setMessage({ tone: "error", text: result.error ?? "La mise à jour de l'index a échoué." });
        return;
      }
      setMessage({
        tone: "success",
        text:
          result.sent === 0
            ? "Aucune carte à envoyer : ce jeu n'a pas encore de carte."
            : `${result.sent} carte${result.sent === 1 ? "" : "s"} envoyée${result.sent === 1 ? "" : "s"} à l'index. L'indexation se termine côté Meilisearch.`,
      });
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? "Mise à jour de l'index…" : "Mettre à jour l'index"}
      </Button>
      {message && (
        <p
          className={`text-xs ${
            message.tone === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
