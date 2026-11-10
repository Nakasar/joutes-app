"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, Layers, MoreHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type { TournamentResultSource, TournamentResultVisibility } from "@/lib/types/TournamentResult";

import {
  deleteResultAction,
  listMyDecksForResults,
  updateMyResultAction,
  type MyDeckForResult,
} from "./actions.ts";

const NONE = "__none";

/**
 * Mon résultat, sur sa ligne de la timeline : lier un de mes decks, choisir
 * qui le voit, le supprimer. Un résultat Joutes ne se supprime pas (il
 * reviendrait à la prochaine réécriture du tournoi) : il se garde pour mes groupes.
 */
export function MyResultMenu({
  resultId,
  gameId,
  source,
  visibility,
  deckId,
}: {
  resultId: string;
  gameId?: string;
  source: TournamentResultSource;
  visibility: TournamentResultVisibility;
  deckId?: string;
}) {
  const t = useTranslations("PlayGroups.hub.tournaments");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deckOpen, setDeckOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [decks, setDecks] = useState<MyDeckForResult[] | null>(null);
  const [choice, setChoice] = useState(deckId ?? NONE);

  const run = (action: () => Promise<{ success: true } | { success: false; error: string }>, done: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(t(`errors.${result.error}` as "errors.FAILED"));
        return;
      }
      done();
      router.refresh();
    });
  };

  const openDecks = () => {
    setChoice(deckId ?? NONE);
    setDeckOpen(true);
    startTransition(async () => {
      const result = await listMyDecksForResults();
      setDecks(result.success ? result.decks.filter((deck) => !gameId || deck.gameId === gameId) : []);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t("myResultMenu")} disabled={pending}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={openDecks}>
            <Layers aria-hidden />
            {deckId ? t("changeDeck") : t("linkDeck")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              run(
                () => updateMyResultAction(resultId, { visibility: visibility === "public" ? "groups" : "public" }),
                () => toast.success(t(visibility === "public" ? "nowGroups" : "nowPublic")),
              )
            }
          >
            {visibility === "public" ? <Users aria-hidden /> : <Eye aria-hidden />}
            {visibility === "public" ? t("makeGroups") : t("makePublic")}
          </DropdownMenuItem>
          {source !== "joutes" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden />
                {t("delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deckOpen} onOpenChange={setDeckOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("linkDeckTitle")}</DialogTitle>
            <DialogDescription>{t("linkDeckDescription")}</DialogDescription>
          </DialogHeader>
          {decks === null ? (
            <div className="h-9 animate-pulse rounded-md border bg-card/60" aria-hidden />
          ) : (
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger aria-label={t("deckPlayed")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noDeckOption")}</SelectItem>
                {decks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name} · v{deck.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeckOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || decks === null || choice === (deckId ?? NONE)}
              onClick={() =>
                run(
                  () => updateMyResultAction(resultId, { deckId: choice === NONE ? null : choice }, deckId),
                  () => setDeckOpen(false),
                )
              }
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("deleteTitle")}
        description={source === "locator" ? t("deleteLocatorBody") : t("deleteBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        busy={pending}
        onConfirm={() => run(() => deleteResultAction(resultId, deckId), () => setDeleteOpen(false))}
      />
    </>
  );
}
