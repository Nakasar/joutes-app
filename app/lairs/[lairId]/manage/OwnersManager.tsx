"use client";

import { useState, useTransition } from "react";
import { User } from "@/lib/types/User";
import { addOwner, removeOwner } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Plus, Mail, User as UserIcon } from "lucide-react";

export default function OwnersManager({
  lairId,
  owners,
}: {
  lairId: string;
  owners: User[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const handleAddOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError("Veuillez entrer un email");
      return;
    }

    startTransition(async () => {
      const result = await addOwner(lairId, email);

      if (result.success) {
        setSuccess(`${result.user?.username || result.user?.email} a été ajouté comme propriétaire`);
        setEmail("");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || "Erreur lors de l'ajout");
      }
    });
  };

  const handleRemoveOwner = async (userId: string) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await removeOwner(lairId, userId);

      if (result.success) {
        setSuccess("Le propriétaire a été retiré");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || "Erreur lors de la suppression");
      }
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* Formulaire d'ajout */}
      <form onSubmit={handleAddOwner} className="flex gap-2">
        <Input
          type="email"
          placeholder="email@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className="flex-1"
        />
        <Button type="submit" disabled={isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter
        </Button>
      </form>

      {/* Liste des owners */}
      <div className="space-y-2">
        {owners.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground text-center">
              Aucun propriétaire pour le moment
            </p>
          </Card>
        ) : (
          owners.map((owner) => (
            <Card key={owner.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <UserIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{owner.username}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {owner.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveOwner(owner.id)}
                  disabled={isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
