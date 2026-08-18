"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Crown, Loader2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerNameTag } from "../PlayerNameTag";

type StaffRole = "organizer" | "judge";

type StaffEntry = {
  userId: string;
  displayName: string;
  discriminator?: string;
  role: StaffRole;
  isCreator: boolean;
};

/**
 * Staff du tournoi : liste des organisateurs et arbitres, ajout par email ou
 * tag username#0000 (organisateurs uniquement — les arbitres consultent en
 * lecture seule).
 */
export function StaffManager({
  tournamentId,
  initialStaff,
  canEdit,
}: {
  tournamentId: string;
  initialStaff: StaffEntry[];
  canEdit: boolean;
}) {
  const t = useTranslations("Tournaments");
  const [staff, setStaff] = useState(initialStaff);
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<StaffRole>("organizer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel = (r: StaffRole) =>
    r === "organizer" ? t("staff.roleOrganizer") : t("staff.roleJudge");

  const add = async () => {
    if (!identifier.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("staff.addError"));
      }
      const entry: StaffEntry = await res.json();
      // Remplace l'entrée si l'utilisateur était déjà dans le staff (changement de rôle).
      setStaff((current) => [...current.filter((s) => s.userId !== entry.userId), entry]);
      setIdentifier("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("staff.addError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: StaffEntry) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/staff/${entry.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("staff.removeError"));
      }
      setStaff((current) => current.filter((s) => s.userId !== entry.userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("staff.removeError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("staff.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <ul className="divide-y rounded-md border">
          {staff.map((entry) => (
            <li key={entry.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <PlayerNameTag
                  name={entry.displayName}
                  discriminator={entry.discriminator}
                  className="truncate text-sm font-medium"
                />
                {entry.isCreator && (
                  <Badge variant="secondary" className="gap-1">
                    <Crown className="h-3 w-3" />
                    {t("staff.creator")}
                  </Badge>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant={entry.role === "organizer" ? "default" : "outline"}>
                  {roleLabel(entry.role)}
                </Badge>
                {canEdit && !entry.isCreator && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-800"
                    onClick={() => remove(entry)}
                    disabled={busy}
                    aria-label={t("staff.removeAria", { name: entry.displayName })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>

        {canEdit && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("staff.identifierPlaceholder")}
                className="min-w-[220px] flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void add();
                  }
                }}
              />
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizer">{t("staff.roleOrganizer")}</SelectItem>
                  <SelectItem value="judge">{t("staff.roleJudge")}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={add} disabled={busy || !identifier.trim()}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {t("staff.addButton")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("staff.addHint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
