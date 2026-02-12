"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Trash2, Shield, Gavel, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  addStaffMemberAction,
  removeStaffMemberAction,
  updateStaffRoleAction,
} from "../../staff-actions";

type StaffMember = {
  userId: string;
  role: "organizer" | "judge";
  displayName: string;
  discriminator: string;
  email: string;
  profileImage?: string;
};

type OrganizerTeamProps = {
  eventId: string;
  initialStaff: StaffMember[];
  isCreator: boolean;
};

export default function OrganizerTeam({ eventId, initialStaff, isCreator }: OrganizerTeamProps) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [userIdentifier, setUserIdentifier] = useState("");
  const [role, setRole] = useState<"organizer" | "judge">("judge");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddStaff = () => {
    if (!userIdentifier.trim()) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await addStaffMemberAction(eventId, userIdentifier, role);

      if (result.success && result.data) {
        setStaff((prev) => [
          ...prev,
          {
            userId: result.data.userId,
            displayName: result.data.displayName || "Utilisateur",
            discriminator: result.data.discriminator || "0000",
            email: result.data.email,
            role: result.data.role,
          },
        ]);
        setUserIdentifier("");
        setSuccess("Membre ajouté à l'équipe");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || "Erreur lors de l'ajout");
      }
    });
  };

  const handleRemoveStaff = (userId: string) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await removeStaffMemberAction(eventId, userId);

      if (result.success) {
        setStaff((prev) => prev.filter((s) => s.userId !== userId));
        setSuccess("Membre retiré de l'équipe");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || "Erreur lors de la suppression");
      }
    });
  };

  const handleUpdateRole = (userId: string, newRole: "organizer" | "judge") => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updateStaffRoleAction(eventId, userId, newRole);

      if (result.success) {
        setStaff((prev) =>
          prev.map((s) => (s.userId === userId ? { ...s, role: newRole } : s))
        );
        setSuccess("Rôle mis à jour");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || "Erreur lors de la mise à jour");
      }
    });
  };

  const getRoleBadge = (staffRole: "organizer" | "judge") => {
    if (staffRole === "organizer") {
      return (
        <Badge variant="default" className="gap-1">
          <Shield className="h-3 w-3" />
          Organisateur
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Gavel className="h-3 w-3" />
        Juge
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Formulaire d'ajout (seulement pour le créateur) */}
      {isCreator && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Ajouter un membre
            </CardTitle>
            <CardDescription>
              Ajoutez un utilisateur par son tag (ex: Pseudo#1234) ou son email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Tag (Pseudo#1234) ou email"
                value={userIdentifier}
                onChange={(e) => setUserIdentifier(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddStaff();
                  }
                }}
                disabled={isPending}
                className="flex-1"
              />
              <Select
                value={role}
                onValueChange={(value) => setRole(value as "organizer" | "judge")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizer">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Organisateur
                    </div>
                  </SelectItem>
                  <SelectItem value="judge">
                    <div className="flex items-center gap-2">
                      <Gavel className="h-4 w-4" />
                      Juge
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAddStaff} disabled={isPending || !userIdentifier.trim()}>
                <UserPlus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mt-3 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground mt-3">
              Les <strong>organisateurs</strong> ont accès au portail organisateur.
              Les <strong>juges</strong> sont visibles comme staff mais n&apos;ont pas accès au portail organisateur.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Liste des membres du staff */}
      <Card>
        <CardHeader>
          <CardTitle>Membres de l&apos;équipe</CardTitle>
          <CardDescription>
            {staff.length === 0
              ? "Aucun membre dans l'équipe pour le moment"
              : `${staff.length} membre${staff.length > 1 ? "s" : ""} dans l'équipe`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun membre dans l&apos;équipe. Ajoutez des organisateurs ou des juges.
            </p>
          ) : (
            <div className="space-y-3">
              {staff.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {member.displayName?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.displayName}
                        <span className="text-muted-foreground">#{member.discriminator}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCreator ? (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            handleUpdateRole(member.userId, value as "organizer" | "judge")
                          }
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="organizer">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                Organisateur
                              </div>
                            </SelectItem>
                            <SelectItem value="judge">
                              <div className="flex items-center gap-2">
                                <Gavel className="h-4 w-4" />
                                Juge
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveStaff(member.userId)}
                          disabled={isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      getRoleBadge(member.role)
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
