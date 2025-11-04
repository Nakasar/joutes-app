"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Calendar, MapPin, Users, Edit, Trash2, X, ArrowLeft, UserMinus, UserPlus, QrCode, Medal, Trophy } from "lucide-react";
import QRCode from "qrcode";
import {
  removePlayerFromMatchAction,
  deleteGameMatchAction,
  addPlayerToMatchAction,
  updateGameMatchAction,
  rateGameMatchAction,
  voteMVPAction,
  toggleWinnerAction,
} from "../actions";
import RatingSelector from "./RatingSelector";

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
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddPlayerDialogOpen, setIsAddPlayerDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isQRCodeDialogOpen, setIsQRCodeDialogOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [newPlayerTag, setNewPlayerTag] = useState("");

  // États pour les nouvelles fonctionnalités
  const [userRating, setUserRating] = useState<1 | 2 | 3 | 4 | 5 | undefined>(
    match.ratings?.find(r => r.userId === currentUserId)?.rating
  );
  const [userMVPVote, setUserMVPVote] = useState<string | undefined>(
    match.mvpVotes?.find(v => v.voterId === currentUserId)?.votedForId
  );

  // Calculer le MVP (joueur avec le plus de votes)
  const mvpCounts = match.players.reduce((acc, player) => {
    const votes = match.mvpVotes?.filter(v => v.votedForId === player.userId).length || 0;
    acc[player.userId] = votes;
    return acc;
  }, {} as Record<string, number>);
  
  const maxVotes = Math.max(...Object.values(mvpCounts), 0);
  const mvpPlayerIds = maxVotes > 0 
    ? Object.keys(mvpCounts).filter(playerId => mvpCounts[playerId] === maxVotes)
    : [];

  // Calculer la note moyenne
  const averageRating = match.ratings && match.ratings.length > 0
    ? match.ratings.reduce((sum, r) => sum + r.rating, 0) / match.ratings.length
    : undefined;

  // Récupérer les messages de l'URL
  useEffect(() => {
    const errorParam = searchParams.get("error");
    const messageParam = searchParams.get("message");
    
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Nettoyer l'URL
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
    
    if (messageParam) {
      setSuccessMessage(decodeURIComponent(messageParam));
      // Nettoyer l'URL
      const url = new URL(window.location.href);
      url.searchParams.delete("message");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

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

  // Générer le QR code lorsque le dialog est ouvert
  useEffect(() => {
    if (isQRCodeDialogOpen && !qrCodeDataUrl) {
      const inviteUrl = `${window.location.origin}/api/game-matches/${match.id}/join`;
      QRCode.toDataURL(inviteUrl, { width: 300 })
        .then((url) => setQrCodeDataUrl(url))
        .catch((error) => console.error("Erreur lors de la génération du QR code:", error));
    }
  }, [isQRCodeDialogOpen, qrCodeDataUrl, match.id]);

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

  const handleRating = (rating: 1 | 2 | 3 | 4 | 5) => {
    setError(null);
    startTransition(async () => {
      const result = await rateGameMatchAction(match.id, rating);
      if (result.success) {
        setUserRating(rating);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l&apos;évaluation");
      }
    });
  };

  const handleVoteMVP = (votedForId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await voteMVPAction(match.id, votedForId);
      if (result.success) {
        setUserMVPVote(votedForId);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors du vote MVP");
      }
    });
  };

  const handleToggleWinner = (userId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleWinnerAction(match.id, userId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la désignation du gagnant");
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

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {successMessage}
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

          {/* Évaluation de la partie */}
          {isPlayer && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Évaluez cette partie</h3>
                <RatingSelector
                  value={userRating}
                  onChange={handleRating}
                  disabled={isPending}
                />
              </div>
              {averageRating && (
                <p className="text-xs text-muted-foreground">
                  Note moyenne : {averageRating.toFixed(1)} / 5
                </p>
              )}
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
                <div className="flex gap-2">
                  <Dialog
                    open={isQRCodeDialogOpen}
                    onOpenChange={setIsQRCodeDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-2">
                        <QrCode className="h-4 w-4" />
                        QR Code d&apos;invitation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>QR Code d&apos;invitation</DialogTitle>
                        <DialogDescription>
                          Scannez ce QR code pour rejoindre la partie automatiquement
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col items-center gap-4 pt-4">
                        {qrCodeDataUrl ? (
                          <img
                            src={qrCodeDataUrl}
                            alt="QR Code d&apos;invitation"
                            className="border rounded-lg"
                          />
                        ) : (
                          <div className="w-[300px] h-[300px] flex items-center justify-center border rounded-lg">
                            <span className="text-muted-foreground">Génération du QR code...</span>
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground text-center">
                          Les joueurs qui scannent ce code rejoindront automatiquement la partie
                        </p>
                      </div>
                    </DialogContent>
                  </Dialog>

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
                </div>
              )}
            </div>

            <div className="space-y-2">
              {match.players.map((player) => {
                const isMVP = mvpPlayerIds.includes(player.userId);
                const isWinner = match.winners?.includes(player.userId);
                const isCurrentUserPlayer = player.userId !== currentUserId && isPlayer;
                const hasVotedForThisPlayer = userMVPVote === player.userId;
                
                return (
                  <div
                    key={player.userId}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm">
                        {player.username}
                      </Badge>
                      
                      {/* Médaille MVP */}
                      {isMVP && (
                        <span title="Most Valuable Player">
                          <Medal className="h-5 w-5 text-yellow-500" />
                        </span>
                      )}
                      
                      {/* Trophée gagnant */}
                      {isWinner && (
                        <span title="Vainqueur">
                          <Trophy className="h-5 w-5 text-amber-600" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Vote MVP pour les joueurs */}
                      {isCurrentUserPlayer && (
                        <Button
                          variant={hasVotedForThisPlayer ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleVoteMVP(player.userId)}
                          disabled={isPending}
                          className="gap-2"
                          title="Voter pour le MVP"
                        >
                          <Medal className="h-4 w-4" />
                          {hasVotedForThisPlayer ? "MVP voté" : "Voter MVP"}
                        </Button>
                      )}
                      
                      {/* Désignation gagnant pour le créateur */}
                      {isCreator && (
                        <Button
                          variant={isWinner ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleWinner(player.userId)}
                          disabled={isPending}
                          className="gap-2"
                          title={isWinner ? "Retirer le trophée" : "Désigner comme vainqueur"}
                        >
                          <Trophy className="h-4 w-4" />
                          Vainqueur
                        </Button>
                      )}
                      
                      {/* Bouton retirer joueur */}
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
