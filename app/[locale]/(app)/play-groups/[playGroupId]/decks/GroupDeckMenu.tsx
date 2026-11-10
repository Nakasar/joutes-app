"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";

import { pinDeckInGroupAction, removeDeckFromGroupAction, type GroupDeckActionError } from "./actions.ts";

/** Épingler (admins) et retirer (l'auteur, ou un admin) un deck de la bibliothèque. */
export function GroupDeckMenu({
  playGroupId,
  deckId,
  deckName,
  pinned,
  pinNote,
  canPin,
  canRemove,
}: {
  playGroupId: string;
  deckId: string;
  deckName: string;
  pinned: boolean;
  pinNote?: string;
  canPin: boolean;
  canRemove: boolean;
}) {
  const t = useTranslations("PlayGroups.hub.decks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pinOpen, setPinOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [note, setNote] = useState(pinNote ?? "");

  if (!canPin && !canRemove) {
    return null;
  }

  const run = (action: () => Promise<{ success: true } | { success: false; error: GroupDeckActionError }>, done: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(t(`errors.${result.error}`));
        return;
      }

      done();
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t("menu", { deck: deckName })}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canPin &&
            (pinned ? (
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => run(() => pinDeckInGroupAction(playGroupId, deckId, false), () => toast.success(t("unpinned")))}
              >
                <PinOff aria-hidden />
                {t("unpin")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={pending} onSelect={() => setPinOpen(true)}>
                <Pin aria-hidden />
                {t("pin")}
              </DropdownMenuItem>
            ))}
          {canRemove && (
            <DropdownMenuItem variant="destructive" disabled={pending} onSelect={() => setRemoveOpen(true)}>
              <Trash2 aria-hidden />
              {t("remove")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pinTitle", { deck: deckName })}</DialogTitle>
            <DialogDescription>{t("pinDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () => pinDeckInGroupAction(playGroupId, deckId, true, note),
                () => {
                  setPinOpen(false);
                  toast.success(t("pinnedToast"));
                },
              );
            }}
          >
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={60}
              placeholder={t("pinNotePlaceholder")}
              aria-label={t("pinNoteLabel")}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPinOpen(false)} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("pinConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t("removeTitle", { deck: deckName })}
        description={t("removeDescription")}
        confirmLabel={t("removeConfirm")}
        cancelLabel={t("cancel")}
        destructive
        busy={pending}
        onConfirm={() =>
          run(
            () => removeDeckFromGroupAction(playGroupId, deckId),
            () => {
              setRemoveOpen(false);
              toast.success(t("removed"));
            },
          )
        }
      />
    </>
  );
}
