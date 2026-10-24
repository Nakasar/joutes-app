"use client";

import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";

/**
 * Partager l'événement : la feuille de partage du système quand le navigateur
 * en a une (téléphone), sinon le lien copié.
 */
export default function EventShareButton({ eventName }: { eventName: string }) {
  const t = useTranslations("EventDetail.share");

  const share = async () => {
    const url = window.location.href.split(/[?#]/)[0];
    if (navigator.share) {
      try {
        await navigator.share({ title: eventName, url });
        return;
      } catch (error) {
        // Feuille refermée : rien à signaler.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("failed"));
    }
  };

  return (
    <Button type="button" variant="outline" size="icon" aria-label={t("label")} onClick={() => void share()}>
      <Share2 className="h-4 w-4" />
    </Button>
  );
}
