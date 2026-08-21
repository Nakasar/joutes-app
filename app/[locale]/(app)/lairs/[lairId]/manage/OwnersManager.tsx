"use client";

import { useState, useTransition } from "react";
import { User } from "@/lib/types/User.ts";
import { useTranslations } from "next-intl";
import { addOwner, removeOwner, type LairManageError } from "./actions.ts";

/** Les échecs de l'action serveur, traduits ici — elle ne renvoie que des codes. */
const ERROR_KEYS: Record<LairManageError, string> = {
  NOT_FOUND: "errors.notFound",
  USER_NOT_FOUND: "errors.userNotFound",
  INVALID: "errors.invalid",
  FAILED: "errors.failed",
};
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card } from "@/components/ui/card.tsx";
import { X, Plus, Mail, User as UserIcon } from "lucide-react";

export default function OwnersManager({
  lairId,
  owners,
}: {
  lairId: string;
  owners: User[];
}) {
  const t = useTranslations("Lairs.manage.owners");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const handleAddOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError(t("errors.emailRequired"));
      return;
    }

    startTransition(async () => {
      const result = await addOwner(lairId, email);

      if (result.success) {
        setSuccess(t("added", { name: result.user?.username || result.user?.email || "" }));
        setEmail("");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(t(ERROR_KEYS[result.error]));
      }
    });
  };

  const handleRemoveOwner = async (userId: string) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await removeOwner(lairId, userId);

      if (result.success) {
        setSuccess(t("removed"));
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(t(ERROR_KEYS[result.error]));
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
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className="flex-1"
        />
        <Button type="submit" disabled={isPending}>
          <Plus className="mr-2 h-4 w-4" />
          {t("add")}
        </Button>
      </form>

      {/* Liste des owners */}
      <div className="space-y-2">
        {owners.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("empty")}
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
