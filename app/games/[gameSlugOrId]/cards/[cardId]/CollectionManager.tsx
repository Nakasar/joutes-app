"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

type CollectionManagerProps = {
  cardId: string;
  gameSlug: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  image: string;
};

export default function CollectionManager({ cardId, gameSlug, cardName, setCode, collectorNumber, image }: CollectionManagerProps) {
  const [quantity, setQuantity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetch(`/api/collection/cards/${encodeURIComponent(cardId)}?gameSlug=${encodeURIComponent(gameSlug)}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data && typeof data.quantity === "number") {
          setQuantity(data.quantity);
        }
      })
      .finally(() => setLoading(false));
  }, [cardId, gameSlug]);

  async function addOne() {
    setUpdating(true);
    try {
      const res = await fetch(`/api/collection/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, name: cardName, setCode, collectorNumber, image }),
      });
      if (res.ok) {
        setQuantity((q) => (q ?? 0) + 1);
      }
    } finally {
      setUpdating(false);
    }
  }

  async function removeOne() {
    if (!quantity) return;
    setUpdating(true);
    try {
      const res = await fetch(
        `/api/collection/cards/${encodeURIComponent(cardId)}?gameSlug=${encodeURIComponent(gameSlug)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setQuantity((q) => Math.max(0, (q ?? 1) - 1));
      }
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Collection&nbsp;:</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={removeOne}
          disabled={updating || !quantity}
          aria-label="Retirer une carte de la collection"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-6 text-center font-semibold">{quantity ?? 0}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={addOne}
          disabled={updating}
          aria-label="Ajouter une carte à la collection"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
