"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import CreateDeckDialog from "@/components/decks/CreateDeckDialog.tsx";
import { Link, useRouter } from "@/i18n/navigation.ts";
import type { Game } from "@/lib/types/Game.ts";

/**
 * Le point d'entrée de l'éditeur depuis la page d'un jeu.
 *
 * La fenêtre de création est celle de « Mes decks », avec le jeu imposé : on
 * arrive ici depuis `/games/:slug/decks`, le jeu est donc déjà dit. Une fois le
 * deck créé, on ouvre son éditeur plutôt que de revenir à la liste — on vient
 * de déclarer vouloir le construire, pas le regarder.
 *
 * Sans compte, le bouton mène à la connexion : ouvrir un formulaire dont
 * l'envoi sera refusé ferait remplir cinq champs pour rien.
 */
export function GameDeckCreateButton({
  game,
  isLoggedIn,
  label,
  signInLabel,
}: {
  game: Game;
  isLoggedIn: boolean;
  label: string;
  signInLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!isLoggedIn) {
    return (
      <Button asChild variant="outline">
        <Link href="/login">{signInLabel}</Link>
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>

      <CreateDeckDialog
        games={[game]}
        lockedGameId={game.id}
        open={open}
        onOpenChange={setOpen}
        onSuccess={(deck) => {
          setOpen(false);
          if (deck) {
            router.push(`/decks/${deck.id}/edit`);
          }
        }}
      />
    </>
  );
}
