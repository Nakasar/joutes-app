"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

const CONDITIONS = ["Damaged", "Played", "Good", "Near Mint", "Mint"] as const;
type Condition = (typeof CONDITIONS)[number];

type CollectionEntry = {
  id: string;
  foil?: boolean;
  language?: string;
  condition?: Condition;
  grade?: number;
};

type CollectionManagerProps = {
  cardId: string;
  gameSlug: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  image: string;
};

export default function CollectionManager({
  cardId,
  gameSlug,
  cardName,
  setCode,
  collectorNumber,
  image,
}: CollectionManagerProps) {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Add form state
  const [foil, setFoil] = useState(false);
  const [language, setLanguage] = useState("");
  const [condition, setCondition] = useState<Condition | "">("");
  const [grade, setGrade] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, gameSlug]);

  async function fetchEntries() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/collection/cards/${encodeURIComponent(cardId)}?gameSlug=${encodeURIComponent(gameSlug)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.cards ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function addCard() {
    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        cardId,
        name: cardName,
        setCode,
        collectorNumber,
        image,
      };
      if (foil) body.foil = true;
      if (language.trim()) body.language = language.trim();
      if (condition) body.condition = condition;
      if (grade !== "") body.grade = parseFloat(grade);

      const res = await fetch(`/api/collection/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => [
          ...prev,
          {
            id: data.id,
            foil: foil || undefined,
            language: language.trim() || undefined,
            condition: condition || undefined,
            grade: grade !== "" ? parseFloat(grade) : undefined,
          },
        ]);
        setFoil(false);
        setLanguage("");
        setCondition("");
        setGrade("");
        setDialogOpen(false);
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeEntry(entryId: string) {
    const res = await fetch(
      `/api/collection/cards/${encodeURIComponent(cardId)}?entryId=${encodeURIComponent(entryId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
  }

  if (loading) {
    return <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Collection&nbsp;:</span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="font-semibold">{entries.length}</span>
          <span className="text-muted-foreground">
            exemplaire{entries.length !== 1 ? "s" : ""}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter à la collection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="foil"
                  checked={foil}
                  onCheckedChange={(v) => setFoil(!!v)}
                />
                <Label htmlFor="foil">Foil</Label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="language">Langue</Label>
                <Input
                  id="language"
                  placeholder="ex: FR, EN, JP…"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="space-y-1">
                <Label>État</Label>
                <Select
                  value={condition}
                  onValueChange={(v) => setCondition(v as Condition)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner un état" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="grade">Note de gradation (0–10)</Label>
                <Input
                  id="grade"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  placeholder="ex: 9.5"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={addCard} disabled={adding}>
                  {adding ? "Ajout…" : "Ajouter"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {expanded && (
        <div className="border rounded-lg divide-y">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">
              Aucun exemplaire dans la collection.
            </p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 gap-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">#{i + 1}</span>
                  {entry.foil && <Badge variant="secondary">Foil</Badge>}
                  {entry.language && (
                    <Badge variant="outline">{entry.language}</Badge>
                  )}
                  {entry.condition && (
                    <Badge variant="outline">{entry.condition}</Badge>
                  )}
                  {entry.grade !== undefined && (
                    <Badge variant="outline">Grade {entry.grade}</Badge>
                  )}
                  {!entry.foil &&
                    !entry.language &&
                    !entry.condition &&
                    entry.grade === undefined && (
                      <span className="text-muted-foreground">Standard</span>
                    )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeEntry(entry.id)}
                  aria-label="Retirer cet exemplaire de la collection"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


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
