"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, X, CheckCircle, AlertCircle } from "lucide-react";
import { addParticipantByTagAction, removeParticipantAction } from "../actions";
import { User } from "@/lib/types/User";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ParticipantManagerProps = {
  eventId: string;
  participants: User[];
};

export default function ParticipantManager({ eventId, participants }: ParticipantManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userTag, setUserTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await addParticipantByTagAction(eventId, userTag);

      if (result.success) {
        setSuccess(`${result.userName} a été ajouté aux participants`);
        setUserTag("");
        router.refresh();
        setTimeout(() => {
          setSuccess(null);
          setOpen(false);
        }, 2000);
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir retirer ce participant ?")) {
      return;
    }

    setRemovingUserId(userId);

    try {
      const result = await removeParticipantAction(eventId, userId);

      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue");
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      {participants.length > 0 && (
        <div className="space-y-2">
          {participants.filter(Boolean).map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-gray-50">
              <div className="flex items-center gap-2 flex-1">
                {user.profileImage && (
                  <img
                    src={user.profileImage}
                    alt={user.displayName || user.username}
                    className="h-6 w-6 rounded-full"
                  />
                )}
                <Link
                  href={`/users/${user.displayName}${user.discriminator}`}
                  className="text-sm hover:underline"
                >
                  {user.displayName || user.username}
                  {user.discriminator && `#${user.discriminator}`}
                </Link>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveParticipant(user.id)}
                disabled={removingUserId === user.id}
                className="h-7 w-7 p-0"
              >
                <X className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

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
              Entrez le tag utilisateur (ex: Username#1234) pour ajouter un participant à l&apos;événement
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddParticipant} className="space-y-4">
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

            <div className="space-y-2">
              <label htmlFor="userTag" className="text-sm font-medium">
                Tag utilisateur
              </label>
              <Input
                id="userTag"
                placeholder="Username#1234"
                value={userTag}
                onChange={(e) => setUserTag(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Ajout..." : "Ajouter"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  setSuccess(null);
                  setUserTag("");
                }}
                disabled={loading}
              >
                Annuler
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
