"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus, CheckCircle, AlertCircle, X, Mail, User as UserIcon } from "lucide-react";
import { addParticipantToEvent, removeParticipantFromEvent } from "./portal/participant-actions";

type Participant = {
  id: string;
  username: string;
  discriminator?: string;
  email?: string;
  profileImage?: string;
  type: "user" | "email" | "guest";
};

type AddParticipantFormProps = {
  eventId: string;
  participants: Participant[];
  onParticipantAdded?: () => void;
  onParticipantRemoved?: () => void;
};

export default function AddParticipantForm({
  eventId,
  participants,
  onParticipantAdded,
  onParticipantRemoved,
}: AddParticipantFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [addType, setAddType] = useState<"userTag" | "email" | "guest">("userTag");
  const [userTag, setUserTag] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [guestUsername, setGuestUsername] = useState("");

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [participantToRemove, setParticipantToRemove] = useState<Participant | null>(null);

  const resetForm = () => {
    setUserTag("");
    setEmail("");
    setUsername("");
    setGuestUsername("");
    setError(null);
    setSuccess(null);
  };

  const handleAddParticipant = () => {
    startTransition(async () => {
      setError(null);
      setSuccess(null);

      let data: any;
      if (addType === "userTag") {
        if (!userTag.trim()) {
          setError("Veuillez entrer un user tag");
          return;
        }
        data = { type: "userTag", userTag: userTag.trim() };
      } else if (addType === "email") {
        if (!email.trim() || !username.trim()) {
          setError("Veuillez remplir tous les champs");
          return;
        }
        data = { type: "email", email: email.trim(), username: username.trim() };
      } else {
        if (!guestUsername.trim()) {
          setError("Veuillez entrer un nom d&apos;utilisateur");
          return;
        }
        data = { type: "guest", username: guestUsername.trim() };
      }

      const result = await addParticipantToEvent(eventId, data);

      if (result.success) {
        const participant = result.participant as any;
        if (participant.newAccount) {
          setSuccess(
            `${participant.username}#${participant.discriminator} a été ajouté (nouveau compte créé)`
          );
        } else if (participant.type === "guest") {
          setSuccess(`${participant.username} (invité) a été ajouté`);
        } else {
          setSuccess(
            `${participant.username}${participant.discriminator ? `#${participant.discriminator}` : ""} a été ajouté`
          );
        }
        resetForm();
        onParticipantAdded?.();
        router.refresh();
        setTimeout(() => {
          setSuccess(null);
          setOpen(false);
        }, 2000);
      } else {
        setError(result.error || "Erreur lors de l&apos;ajout");
      }
    });
  };

  const handleRemoveParticipant = (participant: Participant) => {
    setParticipantToRemove(participant);
    setConfirmRemoveOpen(true);
  };

  const confirmRemove = () => {
    if (!participantToRemove) return;

    startTransition(async () => {
      const result = await removeParticipantFromEvent(eventId, participantToRemove.id);

      if (result.success) {
        onParticipantRemoved?.();
        router.refresh();
        setConfirmRemoveOpen(false);
        setParticipantToRemove(null);
      } else {
        setError(result.error || "Erreur lors de la suppression");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Liste des participants */}
      {participants.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Participants ({participants.length})</h3>
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between gap-2 p-2 rounded hover:bg-gray-50 border"
            >
              <div className="flex items-center gap-2 flex-1">
                {participant.profileImage ? (
                  <img
                    src={participant.profileImage}
                    alt={participant.username}
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                    <UserIcon className="h-3 w-3 text-gray-500" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {participant.username}
                    {participant.discriminator && `#${participant.discriminator}`}
                  </div>
                  {participant.email && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {participant.email}
                    </div>
                  )}
                  {participant.type === "guest" && (
                    <div className="text-xs text-muted-foreground">Invité (sans compte)</div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveParticipant(participant)}
                disabled={isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Bouton d'ajout */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full">
            <UserPlus className="h-4 w-4 mr-2" />
            Ajouter un participant
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un participant</DialogTitle>
            <DialogDescription>
              Ajoutez un participant par son user tag, email ou comme invité
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            {/* Sélection du type */}
            <div className="flex gap-2 border-b pb-2">
              <Button
                variant={addType === "userTag" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddType("userTag")}
              >
                User Tag
              </Button>
              <Button
                variant={addType === "email" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddType("email")}
              >
                Email
              </Button>
              <Button
                variant={addType === "guest" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddType("guest")}
              >
                Invité
              </Button>
            </div>

            {/* Formulaire selon le type */}
            {addType === "userTag" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">User Tag</label>
                <Input
                  value={userTag}
                  onChange={(e) => setUserTag(e.target.value)}
                  placeholder="username#1234"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Format: username#1234 (pour les utilisateurs ayant un compte)
                </p>
              </div>
            )}

            {addType === "email" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nom d&apos;utilisateur</label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nom d&apos;utilisateur"
                    disabled={isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Un compte sera créé automatiquement si l&apos;email n&apos;existe pas
                </p>
              </div>
            )}

            {addType === "guest" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom d&apos;utilisateur</label>
                <Input
                  value={guestUsername}
                  onChange={(e) => setGuestUsername(e.target.value)}
                  placeholder="Nom d&apos;utilisateur"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  L&apos;utilisateur sera ajouté comme invité sans créer de compte
                </p>
              </div>
            )}

            {/* Boutons d'action */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAddParticipant} disabled={isPending} className="flex-1">
                Ajouter
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir retirer {participantToRemove?.username} des participants ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-4">
            <Button
              variant="destructive"
              onClick={confirmRemove}
              disabled={isPending}
              className="flex-1"
            >
              Retirer
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmRemoveOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
