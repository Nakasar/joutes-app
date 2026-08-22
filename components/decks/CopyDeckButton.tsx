"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { useRouter } from "@/i18n/navigation.ts";

/**
 * « Copier chez moi » : reprendre la liste d'un deck publié.
 *
 * La copie arrive privée dans les decks du lecteur, et on l'y emmène aussitôt —
 * un bouton qui répond « c'est fait » sans montrer le résultat laisse le doute
 * sur ce qui a été copié.
 */
export function CopyDeckButton({
  deckId,
  className,
  variant = "default",
  size,
}: {
  deckId: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const response = await fetch(`/api/decks/${deckId}/copy`, { method: "POST" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error("Copie impossible", {
          description: data?.error ?? "Le deck n'a pas pu être copié.",
        });
        return;
      }

      toast.success("Deck copié", { description: "Il vous attend dans vos decks, en privé." });
      router.push(`/decks/${data.id}`);
    } catch (error) {
      console.error("Error copying deck:", error);
      toast.error("Copie impossible", { description: "Une erreur est survenue." });
    } finally {
      setCopying(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={handleCopy} disabled={copying}>
      {copying ? <Loader2 className="animate-spin" /> : <Copy />}
      Copier chez moi
    </Button>
  );
}
