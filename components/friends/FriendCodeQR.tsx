"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode, Copy, Check } from "lucide-react";

export default function FriendCodeQR() {
  const t = useTranslations("Friends.qr");
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setError(null);

    fetch("/api/friends/code")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || t("errors.generic"));
        }
        if (cancelled) {
          return;
        }

        const addUrl = `${window.location.origin}/friends/add/${data.code}`;
        const dataUrl = await QRCode.toDataURL(addUrl, {
          width: 300,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (!cancelled) {
          setQrCodeUrl(dataUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("errors.generic"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const handleCopy = async () => {
    try {
      const response = await fetch("/api/friends/code");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t("errors.generic"));
      }
      await navigator.clipboard.writeText(`${window.location.origin}/friends/add/${data.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <QrCode className="mr-2 h-4 w-4" />
        {t("button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : qrCodeUrl ? (
              <>
                <img
                  src={qrCodeUrl}
                  alt={t("title")}
                  className="rounded-lg border-4 border-gray-200"
                />
                <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? t("copied") : t("copyLink")}
                </Button>
              </>
            ) : (
              <div className="flex h-[300px] w-[300px] items-center justify-center">
                <p className="text-muted-foreground">{t("loading")}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
