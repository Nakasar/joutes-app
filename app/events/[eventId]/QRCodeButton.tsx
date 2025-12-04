"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect } from "react";

type QRCodeButtonProps = {
  eventId: string;
};

export default function QRCodeButton({ eventId }: QRCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  useEffect(() => {
    if (open) {
      // Générer l'URL de participation
      const participationUrl = `${window.location.origin}/events/${eventId}/join`;
      
      // Générer le QR code
      QRCode.toDataURL(participationUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          setQrCodeUrl(url);
        })
        .catch((err) => {
          console.error("Erreur lors de la génération du QR code:", err);
        });
    }
  }, [open, eventId]);

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-4 w-4 mr-2" />
        Code de participation
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Code de participation</DialogTitle>
            <DialogDescription>
              Scannez ce QR code pour rejoindre l&apos;événement
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrCodeUrl ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const participationUrl = `${window.location.origin}/events/${eventId}/join`;
                    navigator.clipboard.writeText(participationUrl);
                  }}
                  className="mb-2"
                >
                  Copier l&apos;URL
                </Button>
                <img
                  src={qrCodeUrl}
                  alt="QR Code de participation"
                  className="border-4 border-gray-200 rounded-lg"
                />
                <p className="text-xs text-center text-muted-foreground">
                  Les participants peuvent scanner ce code pour s&apos;inscrire à l&apos;événement
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
