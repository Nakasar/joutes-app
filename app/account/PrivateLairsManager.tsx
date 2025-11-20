"use client";

import { Lair } from "@/lib/types/Lair";
import { useState, useTransition } from "react";
import {
  createPrivateLair,
  updatePrivateLairAction,
  deletePrivateLairAction,
  regenerateInvitationCodeAction,
} from "./private-lairs-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MapPin,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  QrCode,
  Copy,
  RefreshCw,
  Edit,
  Lock,
} from "lucide-react";

interface PrivateLairsManagerProps {
  userOwnedLairs: Lair[];
}

export default function PrivateLairsManager({ userOwnedLairs }: PrivateLairsManagerProps) {
  const [ownedLairs, setOwnedLairs] = useState<Lair[]>(
    userOwnedLairs.filter((l) => l.isPrivate)
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // États pour la création
  const [isCreating, setIsCreating] = useState(false);
  const [newLairName, setNewLairName] = useState("");
  const [newLairAddress, setNewLairAddress] = useState("");

  // États pour l'édition
  const [editingLair, setEditingLair] = useState<Lair | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  // États pour le QR code
  const [selectedLairForQR, setSelectedLairForQR] = useState<Lair | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCreateLair = () => {
    if (!newLairName.trim()) {
      setError("Le nom du lieu est requis");
      return;
    }

    startTransition(async () => {
      const result = await createPrivateLair(
        newLairName.trim(),
        newLairAddress.trim() || undefined
      );

      if (result.success && result.lairId) {
        setSuccess("Lieu privé créé avec succès !");
        setNewLairName("");
        setNewLairAddress("");
        setIsCreating(false);
        setError(null);

        // Recharger la page pour obtenir les lairs à jour
        window.location.reload();
      } else {
        setError(result.error || "Erreur lors de la création du lieu");
        setSuccess(null);
      }
    });
  };

  const handleUpdateLair = () => {
    if (!editingLair || !editName.trim()) {
      setError("Le nom du lieu est requis");
      return;
    }

    startTransition(async () => {
      const result = await updatePrivateLairAction(
        editingLair.id,
        editName.trim(),
        editAddress.trim() || undefined
      );

      if (result.success) {
        setSuccess("Lieu privé mis à jour avec succès !");
        setOwnedLairs(
          ownedLairs.map((l) =>
            l.id === editingLair.id
              ? { ...l, name: editName, address: editAddress || undefined }
              : l
          )
        );
        setEditingLair(null);
        setError(null);
      } else {
        setError(result.error || "Erreur lors de la mise à jour du lieu");
        setSuccess(null);
      }
    });
  };

  const handleDeleteLair = (lairId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce lieu privé ?")) {
      return;
    }

    startTransition(async () => {
      const result = await deletePrivateLairAction(lairId);

      if (result.success) {
        setSuccess("Lieu privé supprimé avec succès !");
        setOwnedLairs(ownedLairs.filter((l) => l.id !== lairId));
        setError(null);
      } else {
        setError(result.error || "Erreur lors de la suppression du lieu");
        setSuccess(null);
      }
    });
  };

  const handleRegenerateCode = (lair: Lair) => {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir régénérer le code d'invitation ? L'ancien code ne fonctionnera plus."
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await regenerateInvitationCodeAction(lair.id);

      if (result.success && result.invitationCode) {
        setSuccess("Code d'invitation régénéré avec succès !");
        setOwnedLairs(
          ownedLairs.map((l) =>
            l.id === lair.id ? { ...l, invitationCode: result.invitationCode } : l
          )
        );
        setError(null);

        // Si le QR code est affiché, le mettre à jour
        if (selectedLairForQR?.id === lair.id) {
          setSelectedLairForQR({ ...lair, invitationCode: result.invitationCode });
        }
      } else {
        setError(result.error || "Erreur lors de la régénération du code");
        setSuccess(null);
      }
    });
  };

  const getInvitationUrl = (invitationCode: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/lairs/invite/${invitationCode}`;
  };

  const copyInvitationUrl = (invitationCode: string) => {
    const url = getInvitationUrl(invitationCode);
    navigator.clipboard.writeText(url);
    setCopiedCode(invitationCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Mes lieux privés
        </h3>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Créer un lieu privé
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un lieu privé</DialogTitle>
              <DialogDescription>
                Les lieux privés ne sont visibles que par les utilisateurs que vous invitez.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Nom du lieu *
                </label>
                <Input
                  id="name"
                  placeholder="Mon lieu de jeu"
                  value={newLairName}
                  onChange={(e) => setNewLairName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="address" className="text-sm font-medium">
                  Adresse (optionnel)
                </label>
                <Input
                  id="address"
                  placeholder="123 rue de la Paix"
                  value={newLairAddress}
                  onChange={(e) => setNewLairAddress(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreateLair} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {ownedLairs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground space-y-2">
          <Lock className="h-12 w-12 mx-auto opacity-50" />
          <p>Vous n&apos;avez aucun lieu privé pour le moment.</p>
          <p className="text-sm">
            Créez un lieu privé pour organiser des événements privés avec vos amis.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ownedLairs.map((lair) => (
            <Card key={lair.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      {lair.name}
                    </CardTitle>
                    {lair.address && (
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {lair.address}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedLairForQR(lair)}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Code d&apos;invitation - {lair.name}</DialogTitle>
                          <DialogDescription>
                            Partagez ce lien ou ce QR code pour inviter des utilisateurs à suivre
                            ce lieu privé.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {lair.invitationCode && (
                            <>
                              <div className="flex gap-2">
                                <Input
                                  value={getInvitationUrl(lair.invitationCode)}
                                  readOnly
                                  className="font-mono text-sm"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => copyInvitationUrl(lair.invitationCode!)}
                                >
                                  {copiedCode === lair.invitationCode ? (
                                    "Copié !"
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                              <div className="flex justify-center bg-white p-4 rounded-lg">
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                    getInvitationUrl(lair.invitationCode)
                                  )}`}
                                  alt="QR Code"
                                  className="w-48 h-48"
                                />
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRegenerateCode(lair)}
                                disabled={isPending}
                                className="w-full"
                              >
                                {isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Régénérer le code
                              </Button>
                            </>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Dialog
                      open={editingLair?.id === lair.id}
                      onOpenChange={(open) => {
                        if (open) {
                          setEditingLair(lair);
                          setEditName(lair.name);
                          setEditAddress(lair.address || "");
                        } else {
                          setEditingLair(null);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Modifier le lieu</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <label htmlFor="edit-name" className="text-sm font-medium">
                              Nom du lieu *
                            </label>
                            <Input
                              id="edit-name"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="edit-address" className="text-sm font-medium">
                              Adresse (optionnel)
                            </label>
                            <Input
                              id="edit-address"
                              value={editAddress}
                              onChange={(e) => setEditAddress(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setEditingLair(null)}>
                            Annuler
                          </Button>
                          <Button onClick={handleUpdateLair} disabled={isPending}>
                            {isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Mettre à jour
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteLair(lair.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
