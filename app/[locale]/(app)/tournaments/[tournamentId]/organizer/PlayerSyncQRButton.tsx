"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { QrCode } from "lucide-react";
import QRCode from "qrcode";

type PlayerSyncQRButtonProps = {
  tournamentId: string;
  playerName: string;
  syncKey: string;
};

export function PlayerSyncQRButton({ tournamentId, playerName, syncKey }: PlayerSyncQRButtonProps) {
  const t = useTranslations("Tournaments");
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  const joinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/tournaments/join?tournamentId=${encodeURIComponent(tournamentId)}&key=${encodeURIComponent(syncKey)}`
    : "";

  useEffect(() => {
    if (open && joinUrl) {
      QRCode.toDataURL(joinUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then(setQrCodeUrl)
        .catch((err) => {
          console.error("Erreur lors de la génération du QR code:", err);
        });
    }
  }, [open, joinUrl]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4 mr-2" />
        {t("playerSync.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("playerSync.dialogTitle", { name: playerName })}</DialogTitle>
            <DialogDescription>{t("playerSync.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrCodeUrl ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(joinUrl)}
                  className="mb-2"
                >
                  {t("playerSync.copyLink")}
                </Button>
                <img
                  src={qrCodeUrl}
                  alt={t("playerSync.qrAlt", { name: playerName })}
                  className="border-4 border-gray-200 rounded-lg"
                />
                <p className="text-xs text-center text-muted-foreground">
                  {t("playerSync.secretHint")}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center h-[300px] w-[300px]">
                <p className="text-muted-foreground">{t("playerSync.generating")}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
