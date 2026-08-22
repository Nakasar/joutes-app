"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pin } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

import { setPinnedDeckAction } from "./profile-actions.ts";

export type ProfileDeckCard = {
  id: string;
  name: string;
  gameName?: string;
  image?: string;
  updatedAt: string;
};

/**
 * Les decks publics d'un compte.
 *
 * Sur son propre profil, cliquer la vignette épingle le deck — et re-cliquer le
 * désépingle. Un seul à la fois : c'est ce qu'« épinglé » veut dire, et deux
 * decks en avant n'en mettent aucun.
 *
 * Chez quelqu'un d'autre, la carte est un simple lien : le geste d'épinglage
 * n'existe pas, plutôt que d'exister et d'échouer.
 */
export default function PinnedDeckGrid({
  decks,
  pinnedDeckId: initialPinned,
  canPin,
}: {
  decks: ProfileDeckCard[];
  pinnedDeckId: string | null;
  canPin: boolean;
}) {
  const t = useTranslations("Users.profile.decks");
  const router = useRouter();
  const [pinned, setPinned] = useState(initialPinned);
  const [isBusy, startTransition] = useTransition();

  const togglePin = (deckId: string) => {
    const next = pinned === deckId ? null : deckId;
    setPinned(next);

    startTransition(async () => {
      const result = await setPinnedDeckAction(next);

      if (!result.success) {
        setPinned(pinned);
        toast.error(t(`errors.${result.error}` as "errors.FAILED"));
        return;
      }

      router.refresh();
    });
  };

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {decks.map((deck) => {
        const isPinned = deck.id === pinned;

        const body = (
          <>
            <span className="relative block h-[130px] w-full overflow-hidden rounded-t-[10px] bg-muted">
              {deck.image ? (
                // L'image vient du catalogue de cartes, dont l'hôte n'est pas
                // déclaré dans `next.config.ts`.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deck.image} alt="" className="h-full w-full object-cover object-top" />
              ) : null}

              {isPinned && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border bg-background/90 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
                  <Pin className="size-2.5" aria-hidden />
                  {t("pinned")}
                </span>
              )}
            </span>

            <span className="flex flex-col gap-1 p-3">
              {deck.gameName && (
                <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                  {deck.gameName}
                </span>
              )}
              <span className="text-[15px] leading-tight font-semibold">{deck.name}</span>
            </span>
          </>
        );

        return (
          <li key={deck.id}>
            {canPin ? (
              <button
                type="button"
                onClick={() => togglePin(deck.id)}
                disabled={isBusy}
                aria-pressed={isPinned}
                title={isPinned ? t("unpin") : t("pin")}
                className={cn(
                  "block w-full overflow-hidden rounded-[10px] border bg-card text-left transition-colors hover:bg-accent",
                  isPinned && "border-primary",
                )}
              >
                {body}
              </button>
            ) : (
              <Link
                href={`/decks/${deck.id}`}
                className={cn(
                  "block overflow-hidden rounded-[10px] border bg-card transition-colors hover:bg-accent",
                  isPinned && "border-primary",
                )}
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
