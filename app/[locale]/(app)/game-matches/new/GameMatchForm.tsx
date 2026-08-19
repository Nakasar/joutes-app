"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { createGameMatchAction } from "../actions.ts";
import { Game } from "@/lib/types/Game.ts";
import { Lair } from "@/lib/types/Lair.ts";
import { User } from "@/lib/types/User.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { DateTime } from "luxon";
import { X } from "lucide-react";
import DeckSelector from "@/components/DeckSelector.tsx";
import ArmyListEditor from "@/components/battle-reports/ArmyListEditor.tsx";
import type { BattleReportArmy, GameMatchGuest } from "@/lib/types/Match.ts";
import { MAX_GUESTS, MAX_GUEST_NAME_LENGTH, guestId } from "@/lib/matches/participants.ts";
import { nanoid } from "nanoid";
import { MAX_NOTES_LENGTH, MAX_SCENARIO_LENGTH } from "@/lib/battle-reports/army.ts";

type GameMatchFormProps = {
  games: Game[];
  lairs: Lair[];
  currentUser: User;
  /** Jeu pré-sélectionné, quand le formulaire est ouvert depuis une fiche de jeu. */
  initialGameId?: string;
};

type PlayerInput = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
};

export default function GameMatchForm({
  games,
  lairs,
  currentUser,
  initialGameId,
}: GameMatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  // Date et heure par défaut (maintenant)
  const now = DateTime.now().setZone('Europe/Paris');
  const defaultDateTime = now.toFormat("yyyy-MM-dd'T'HH:mm");
  
  const [formData, setFormData] = useState({
    gameId: initialGameId ?? (games.length > 0 ? games[0].id : ""),
    playedAt: defaultDateTime,
    lairId: "",
  });

  // Le joueur courant est automatiquement ajouté
  const [players, setPlayers] = useState<PlayerInput[]>([
    {
      id: currentUser.id,
      username: currentUser.displayName && currentUser.discriminator
        ? `${currentUser.displayName}#${currentUser.discriminator}`
        : currentUser.username,
      displayName: currentUser.displayName,
      discriminator: currentUser.discriminator,
    },
  ]);

  // État pour les decks sélectionnés { playerId: deckId }
  const [playerDecks, setPlayerDecks] = useState<Record<string, string | undefined>>({});

  const [newPlayerTag, setNewPlayerTag] = useState("");

  /**
   * Participants sans compte. Leur identifiant est fabriqué ici plutôt qu'au
   * serveur : une liste d'armée se saisit avant l'enregistrement, et il lui faut
   * dès maintenant quelque chose à quoi s'accrocher.
   */
  const [guests, setGuests] = useState<GameMatchGuest[]>([]);
  const [newGuestName, setNewGuestName] = useState("");

  /**
   * Rapport de bataille. Le format suit le jeu : les jeux qui activent la
   * fonctionnalité l'imposent, les autres le proposent — un joueur peut vouloir
   * raconter une partie d'un jeu dont le fanion n'est pas encore posé.
   */
  const selectedGame = games.find((game) => game.id === formData.gameId);
  const [optedInBattleReport, setOptedInBattleReport] = useState(false);
  const isBattleReport = Boolean(selectedGame?.features?.battleReports) || optedInBattleReport;

  const [scenario, setScenario] = useState("");
  const [notes, setNotes] = useState("");
  const [armies, setArmies] = useState<Record<string, BattleReportArmy>>({});

  const addPlayer = () => {
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
      setError("Le nom d'utilisateur ne peut pas être vide");
      return;
    }

    if (!discriminator.trim() || discriminator.length !== 4 || !/^\d{4}$/.test(discriminator)) {
      setError("Le discriminant doit être un nombre à 4 chiffres");
      return;
    }

    // Vérifier si le joueur n'est pas déjà dans la liste
    const existingPlayer = players.find(
      (p) =>
        p.displayName === displayName.trim() &&
        p.discriminator === discriminator.trim()
    );

    if (existingPlayer) {
      setError("Ce joueur est déjà dans la liste");
      return;
    }

    // Ajouter le joueur (l'ID sera résolu côté serveur si possible)
    const newPlayer: PlayerInput = {
      id: "", // Sera résolu côté serveur ou laissé vide
      username: trimmedTag,
      displayName: displayName.trim(),
      discriminator: discriminator.trim(),
    };

    setPlayers([...players, newPlayer]);
    setNewPlayerTag("");
    setError(null);
  };

  const addGuest = () => {
    const name = newGuestName.trim();

    if (!name) {
      setError("Veuillez entrer le nom de l'invité");
      return;
    }

    if (guests.length >= MAX_GUESTS) {
      setError(`Une partie ne peut pas compter plus de ${MAX_GUESTS} invités`);
      return;
    }

    // Deux invités homonymes restent deux joueurs distincts : c'est
    // l'identifiant qui les sépare, jamais le nom.
    setGuests([...guests, { id: guestId(nanoid(8)), name }]);
    setNewGuestName("");
    setError(null);
  };

  const removeGuest = (id: string) => {
    setGuests(guests.filter((guest) => guest.id !== id));
    // La liste d'armée saisie pour cet invité part avec lui : le serveur
    // l'abandonnerait de toute façon, faute de propriétaire.
    setArmies(Object.fromEntries(Object.entries(armies).filter(([playerId]) => playerId !== id)));
  };

  const removePlayer = (index: number) => {
    // Ne pas permettre de retirer le joueur courant (index 0)
    if (index === 0) {
      setError("Vous ne pouvez pas vous retirer de la partie");
      return;
    }
    setPlayers(players.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (players.length === 0) {
      setError("Au moins un joueur est requis");
      return;
    }

    // Filtrer les decks pour ne garder que ceux qui sont définis
    const decksToSubmit: Record<string, string> = {};
    Object.entries(playerDecks).forEach(([playerId, deckId]) => {
      if (deckId) {
        decksToSubmit[playerId] = deckId;
      }
    });

    startTransition(async () => {
      const result = await createGameMatchAction({
        gameId: formData.gameId,
        playedAt: new Date(formData.playedAt),
        lairId: formData.lairId || undefined,
        players: players.map((p) => ({
          userId: p.id || currentUser.id, // Utiliser l'ID courant si pas d'ID
          username: p.username,
          displayName: p.displayName,
          discriminator: p.discriminator,
        })),
        // Un rapport de bataille n'a pas de deck : les decks choisis avant que
        // l'interrupteur soit poussé restent dans l'état du formulaire, mais ne
        // doivent pas entrer en base sous un format qui ne les affiche jamais.
        decks:
          !isBattleReport && Object.keys(decksToSubmit).length > 0
            ? decksToSubmit
            : undefined,
        guests: guests.length > 0 ? guests : undefined,
        // L'objet, même vide, est ce qui fait de la partie un rapport de
        // bataille : le format ne dépend pas de ce qui a déjà été rempli.
        battleReport: isBattleReport
          ? { scenario, notes, armies }
          : undefined,
      });

      if (result.success) {
        router.push("/game-matches");
      } else {
        setError(result.error || "Erreur lors de la création de la partie");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Jeu */}
      <div className="space-y-2">
        <label htmlFor="gameId" className="text-sm font-medium">
          Jeu <span className="text-destructive">*</span>
        </label>
        <Select
          value={formData.gameId}
          onValueChange={(value) => setFormData({ ...formData, gameId: value })}
        >
          <SelectTrigger id="gameId">
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

      {/* Format rapport de bataille */}
      <div className="flex items-start justify-between gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="space-y-1">
          <p className="text-sm font-medium">Rapport de bataille</p>
          <p className="text-xs text-muted-foreground">
            {selectedGame?.features?.battleReports
              ? `Les parties de ${selectedGame.name} sont enregistrées en rapport de bataille : listes d'armée, scénario et notes.`
              : "Ajoutez les listes d'armée jouées, le scénario et une fiche de notes."}
          </p>
        </div>
        <Switch
          checked={isBattleReport}
          disabled={isPending || Boolean(selectedGame?.features?.battleReports)}
          onCheckedChange={setOptedInBattleReport}
          aria-label="Enregistrer cette partie en rapport de bataille"
        />
      </div>

      {/* Date et heure */}
      <div className="space-y-2">
        <label htmlFor="playedAt" className="text-sm font-medium">
          Date et heure de la partie <span className="text-destructive">*</span>
        </label>
        <Input
          id="playedAt"
          type="datetime-local"
          required
          value={formData.playedAt}
          onChange={(e) => setFormData({ ...formData, playedAt: e.target.value })}
        />
      </div>

      {/* Lair (optionnel) */}
      <div className="space-y-2">
        <label htmlFor="lairId" className="text-sm font-medium">
          Lieu <span className="text-muted-foreground">(optionnel)</span>
        </label>
        <Select
          value={formData.lairId}
          onValueChange={(value) => setFormData({ ...formData, lairId: value === "OTHER" ? "" : value })}
        >
          <SelectTrigger id="lairId">
            <SelectValue placeholder="Sélectionner un lieu (optionnel)" />
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

      {/* Liste des joueurs */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Joueurs <span className="text-destructive">*</span>
        </label>
        <div className="space-y-3">
          {players.map((player, index) => (
            <div
              key={index}
              className="p-3 border rounded-lg bg-muted/50 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">{player.username}</span>
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePlayer(index)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {/* Liste d'armée (rapport de bataille) ou deck (jeu de cartes).
                  Dans les deux cas, seuls les joueurs déjà identifiés peuvent
                  s'en voir attribuer une : un invité résolu côté serveur n'a pas
                  encore d'identifiant sur lequel accrocher la saisie. */}
              {player.id && isBattleReport && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Liste d&apos;armée (optionnel)
                  </label>
                  <ArmyListEditor
                    gameId={formData.gameId}
                    idPrefix={`player-${index}`}
                    army={armies[player.id] ?? { units: [] }}
                    onChange={(army) =>
                      setArmies({ ...armies, [player.id]: army })
                    }
                    disabled={isPending}
                  />
                </div>
              )}

              {player.id && !isBattleReport && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Deck utilisé (optionnel)
                  </label>
                  <DeckSelector
                    playerId={player.id}
                    gameId={formData.gameId}
                    value={playerDecks[player.id]}
                    onChange={(deckId) => {
                      setPlayerDecks({
                        ...playerDecks,
                        [player.id]: deckId,
                      });
                    }}
                    playerName={player.displayName || player.username}
                    disabled={isPending}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Ajouter un joueur */}
        <div className="space-y-2 pt-2">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="username#1234"
              value={newPlayerTag}
              onChange={(e) => setNewPlayerTag(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={addPlayer} variant="outline">
              Ajouter
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Format : username#1234
          </p>
        </div>

        {/* Invités : des participants sans compte sur Joutes. Ils comptent dans
            la partie, mais ne la verront pas dans leur historique — ils n'en ont
            pas. */}
        <div className="space-y-3 pt-4">
          <label className="text-sm font-medium">
            Invités <span className="text-muted-foreground">(sans compte)</span>
          </label>

          {guests.map((guest) => (
            <div key={guest.id} className="p-3 border rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">{guest.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGuest(guest.id)}
                  className="h-8 w-8 p-0"
                  aria-label={`Retirer ${guest.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {isBattleReport && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Liste d&apos;armée (optionnel)
                  </label>
                  <ArmyListEditor
                    gameId={formData.gameId}
                    idPrefix={`guest-${guest.id}`}
                    army={armies[guest.id] ?? { units: [] }}
                    onChange={(army) => setArmies({ ...armies, [guest.id]: army })}
                    disabled={isPending}
                  />
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Nom de l&apos;invité"
              maxLength={MAX_GUEST_NAME_LENGTH}
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={addGuest} variant="outline">
              Ajouter
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Un invité est enregistré dans cette partie seulement : il ne reçoit pas de
            notification et ne la retrouvera pas dans un historique.
          </p>
        </div>
      </div>

      {/* Scénario et notes du rapport de bataille */}
      {isBattleReport && (
        <>
          <div className="space-y-2">
            <label htmlFor="scenario" className="text-sm font-medium">
              Scénario <span className="text-muted-foreground">(optionnel)</span>
            </label>
            <Input
              id="scenario"
              type="text"
              value={scenario}
              maxLength={MAX_SCENARIO_LENGTH}
              disabled={isPending}
              placeholder="Ex. : Prise de position"
              onChange={(e) => setScenario(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes <span className="text-muted-foreground">(optionnel)</span>
            </label>
            <Textarea
              id="notes"
              value={notes}
              rows={6}
              maxLength={MAX_NOTES_LENGTH}
              disabled={isPending}
              placeholder="Le déroulé de la partie, les moments marquants, ce qu'il faudra retenir pour la prochaine fois…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Boutons */}
      <div className="flex gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
          className="flex-1"
        >
          Annuler
        </Button>
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? "Création en cours..." : "Enregistrer la partie"}
        </Button>
      </div>
    </form>
  );
}
