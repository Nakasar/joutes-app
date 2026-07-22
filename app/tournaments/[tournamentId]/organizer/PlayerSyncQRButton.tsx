"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode } from "lucide-react";
import QRCode from "qrcode";

type PlayerSyncQRButtonProps = {
  tournamentId: string;
  playerName: string;
  syncKey: string;
};

export function PlayerSyncQRButton({ tournamentId, playerName, syncKey }: PlayerSyncQRButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  const joinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/tournaments/join?tournamentId=${tournamentId}&key=${syncKey}`
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
        QR joueur
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Synchronisation de {playerName}</DialogTitle>
            <DialogDescription>
              Faites scanner ce QR code par le joueur : son navigateur sera lié à ce
              tournoi et il pourra accéder à son portail joueur, même sans compte.
            </DialogDescription>
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
                  Copier le lien
                </Button>
                <img
                  src={qrCodeUrl}
                  alt={`QR code de synchronisation de ${playerName}`}
                  className="border-4 border-gray-200 rounded-lg"
                />
                <p className="text-xs text-center text-muted-foreground">
                  Ce lien contient la clé secrète du joueur : ne le partagez qu&apos;avec lui.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center h-[300px] w-[300px]">
                <p className="text-muted-foreground">Génération du QR code...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
