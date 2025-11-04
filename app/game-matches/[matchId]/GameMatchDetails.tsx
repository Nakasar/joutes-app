"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GameMatch } from "@/lib/types/GameMatch";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DateTime } from "luxon";
import { Calendar, MapPin, Users, Edit, Trash2, X, ArrowLeft, UserMinus, UserPlus } from "lucide-react";
import {
  removePlayerFromMatchAction,
  deleteGameMatchAction,
  addPlayerToMatchAction,
  updateGameMatchAction,
} from "../actions";

type GameMatchDetailsProps = {
  match: GameMatch;
  games: Game[];
  lairs: Lair[];
  currentUserId: string;
};

export default function GameMatchDetails({
  match,
  games,
  lairs,
  currentUserId,
}: GameMatchDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddPlayerDialogOpen, setIsAddPlayerDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [newPlayerTag, setNewPlayerTag] = useState("");

  const isCreator = match.createdBy === currentUserId;
  const isPlayer = match.players.some((p) => p.userId === currentUserId);

  const gameName = games.find((g) => g.id === match.gameId)?.name || "Jeu inconnu";
  const lairName = match.lairId
    ? lairs.find((l) => l.id === match.lairId)?.name
    : null;
  const playedDate = DateTime.fromJSDate(match.playedAt).setZone("Europe/Paris");

  // État du formulaire d'édition
  const defaultDateTime = DateTime.fromJSDate(match.playedAt)
    .setZone("Europe/Paris")
    .toFormat("yyyy-MM-dd'T'HH:mm");

  const [editFormData, setEditFormData] = useState({
    gameId: match.gameId,
    playedAt: defaultDateTime,
    lairId: match.lairId || "",
  });

  const handleRemovePlayer = (playerUserId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await removePlayerFromMatchAction(match.id, playerUserId);
      if (result.success) {
        // Si l'utilisateur se retire lui-même, rediriger vers la liste
        if (playerUserId === currentUserId) {
          router.push("/game-matches");
        } else {
          router.refresh();
        }
      } else {
        setError(result.error || "Erreur lors du retrait du joueur");
      }
    });
  };

  const handleAddPlayer = () => {
    const trimmedTag = newPlayerTag.trim();

    if (!trimmedTag) {
      setError("Veuillez entrer le tag du joueur");
      return;
    }

    // Découper le tag sur le #
    const parts = trimmedTag.split("#");

    if (parts.length !== 2) {
      setError("Le tag doit être au format username#1234");
      return;
    }

    const [displayName, discriminator] = parts;

    if (!displayName.trim()) {
      setError("Le nom d&apos;utilisateur ne peut pas être vide");
      return;
    }

    if (
      !discriminator.trim() ||
      discriminator.length !== 4 ||
      !/^\d{4}$/.test(discriminator)
    ) {
      setError("Le discriminant doit être un nombre à 4 chiffres");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await addPlayerToMatchAction(
        match.id,
        displayName.trim(),
        discriminator.trim()
      );
      if (result.success) {
        setNewPlayerTag("");
        setIsAddPlayerDialogOpen(false);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l&apos;ajout du joueur");
      }
    });
  };

  const handleUpdateMatch = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateGameMatchAction(match.id, {
        gameId: editFormData.gameId,
        playedAt: new Date(editFormData.playedAt),
        lairId: editFormData.lairId || null,
      });
      if (result.success) {
        setIsEditDialogOpen(false);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la mise à jour de la partie");
      }
    });
  };

  const handleDeleteMatch = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteGameMatchAction(match.id);
      if (result.success) {
        router.push("/game-matches");
      } else {
        setError(result.error || "Erreur lors de la suppression de la partie");
        setIsDeleteDialogOpen(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Bouton retour */}
      <Button
        variant="ghost"
        onClick={() => router.push("/game-matches")}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux parties
      </Button>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <Card className="p-6">
        <div className="space-y-6">
          {/* En-tête avec jeu et actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl font-bold">{gameName}</h1>
                {isCreator && (
                  <Badge variant="outline" className="text-xs">
                    Créateur
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{playedDate.toFormat("dd/MM/yyyy 'à' HH:mm")}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {isCreator && (
                <>
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Edit className="h-4 w-4" />
                        Modifier
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Modifier la partie</DialogTitle>
                        <DialogDescription>
                          Modifiez les détails de la partie
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        {/* Jeu */}
                        <div className="space-y-2">
                          <label htmlFor="edit-gameId" className="text-sm font-medium">
                            Jeu
                          </label>
                          <Select
                            value={editFormData.gameId}
                            onValueChange={(value) =>
                              setEditFormData({ ...editFormData, gameId: value })
                            }
                          >
                            <SelectTrigger id="edit-gameId">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {games.map((game) => (
                                <SelectItem key={game.id} value={game.id}>
                                  {game.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Date et heure */}
                        <div className="space-y-2">
                          <label htmlFor="edit-playedAt" className="text-sm font-medium">
                            Date et heure
                          </label>
                          <Input
                            id="edit-playedAt"
                            type="datetime-local"
                            value={editFormData.playedAt}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                playedAt: e.target.value,
                              })
                            }
                          />
                        </div>

                        {/* Lieu */}
                        <div className="space-y-2">
                          <label htmlFor="edit-lairId" className="text-sm font-medium">
                            Lieu
                          </label>
                          <Select
                            value={editFormData.lairId}
                            onValueChange={(value) =>
                              setEditFormData({ ...editFormData, lairId: value === 'OTHER' ? "" : value })
                            }
                          >
                            <SelectTrigger id="edit-lairId">
                              <SelectValue placeholder="Autre lieu" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OTHER">Autre lieu</SelectItem>
                              {lairs.map((lair) => (
                                <SelectItem key={lair.id} value={lair.id}>
                                  {lair.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setIsEditDialogOpen(false)}
                            disabled={isPending}
                            className="flex-1"
                          >
                            Annuler
                          </Button>
                          <Button
                            onClick={handleUpdateMatch}
                            disabled={isPending}
                            className="flex-1"
                          >
                            {isPending ? "Modification..." : "Enregistrer"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Supprimer la partie</DialogTitle>
                        <DialogDescription>
                          Êtes-vous sûr de vouloir supprimer cette partie ? Cette action
                          est irréversible.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setIsDeleteDialogOpen(false)}
                          disabled={isPending}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteMatch}
                          disabled={isPending}
                          className="flex-1"
                        >
                          {isPending ? "Suppression..." : "Supprimer"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              {!isCreator && isPlayer && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <UserMinus className="h-4 w-4" />
                      Se retirer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Se retirer de la partie</DialogTitle>
                      <DialogDescription>
                        Êtes-vous sûr de vouloir vous retirer de cette partie ?
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" className="flex-1">
                        Annuler
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleRemovePlayer(currentUserId)}
                        disabled={isPending}
                        className="flex-1"
                      >
                        {isPending ? "En cours..." : "Se retirer"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* Lieu */}
          {lairName && (
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <span className="text-lg">{lairName}</span>
            </div>
          )}

          {/* Liste des joueurs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">
                  Joueurs ({match.players.length})
                </h2>
              </div>
              {isCreator && (
                <Dialog
                  open={isAddPlayerDialogOpen}
                  onOpenChange={setIsAddPlayerDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <UserPlus className="h-4 w-4" />
                      Ajouter un joueur
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Ajouter un joueur</DialogTitle>
                      <DialogDescription>
                        Entrez le tag du joueur à ajouter
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Input
                          type="text"
                          placeholder="username#1234"
                          value={newPlayerTag}
                          onChange={(e) => setNewPlayerTag(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Format : username#1234
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsAddPlayerDialogOpen(false);
                            setNewPlayerTag("");
                            setError(null);
                          }}
                          disabled={isPending}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                        <Button
                          onClick={handleAddPlayer}
                          disabled={isPending || !newPlayerTag.trim()}
                          className="flex-1"
                        >
                          {isPending ? "Ajout..." : "Ajouter"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="space-y-2">
              {match.players.map((player) => (
                <div
                  key={player.userId}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                >
                  <Badge variant="secondary" className="text-sm">
                    {player.username}
                  </Badge>
                  {isCreator && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <X className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Retirer le joueur</DialogTitle>
                          <DialogDescription>
                            Êtes-vous sûr de vouloir retirer {player.username} de la
                            partie ?
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex gap-2 pt-4">
                          <Button variant="outline" className="flex-1">
                            Annuler
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleRemovePlayer(player.userId)}
                            disabled={isPending}
                            className="flex-1"
                          >
                            {isPending ? "En cours..." : "Retirer"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
