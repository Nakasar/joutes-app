"use client";

import { useState } from "react";
import { Ellipsis, QrCode, Trash2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import QRCodeButton from "./QRCodeButton.tsx";
import CancelEventButton from "./CancelEventButton.tsx";
import DeleteEventButton from "./DeleteEventButton.tsx";

type Dialog = "qr" | "cancel" | "delete" | null;

/**
 * Le menu « … » de l'organisation : les gestes rares ou destructeurs, rangés
 * à l'écart des réglages courants. Chaque entrée ouvre sa fenêtre, rendue hors
 * du menu pour survivre à sa fermeture.
 */
export default function EventManageMenu({
  eventId,
  eventName,
  canCancel,
}: {
  eventId: string;
  eventName: string;
  /** Faux pour un événement déjà annulé ou terminé. */
  canCancel: boolean;
}) {
  const t = useTranslations("EventDetail.manage");
  const [dialog, setDialog] = useState<Dialog>(null);
  const openChange = (name: Exclude<Dialog, null>) => (open: boolean) => setDialog(open ? name : null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={t("more")}>
            <Ellipsis className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setDialog("qr")}>
            <QrCode className="h-4 w-4" />
            {t("qrCode")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canCancel && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
              <XCircle className="h-4 w-4" />
              {t("cancel")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 className="h-4 w-4" />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <QRCodeButton eventId={eventId} open={dialog === "qr"} onOpenChange={openChange("qr")} />
      {canCancel && (
        <CancelEventButton
          eventId={eventId}
          eventName={eventName}
          open={dialog === "cancel"}
          onOpenChange={openChange("cancel")}
        />
      )}
      <DeleteEventButton
        eventId={eventId}
        eventName={eventName}
        open={dialog === "delete"}
        onOpenChange={openChange("delete")}
      />
    </>
  );
}
